'use strict';

// Environment
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

// Config
var config = require('../../config');

// Libraries
var _ = require('lodash');
var async = require('async');
var request = require('request');
var moment = require('moment');
var Holidays = require('date-holidays');
var usHolidays = require('@date/holidays-us');

// State and data
var baseInvestment = 0;
var holdingQty = 0;
var holdingCostBasis = 0;
var cash = 0;
var buyingPower = 0;
var accountValue = 0;
var quote = {};
var historicalQuotes = [];
var recentLargeChangeCounter = 0;
var activityOccurred = false;

// Set up the trading client.
var tradingClient = require('../../lib/tradingClients/base').factory(config.client, config.brokerage);

// Set up the SMS client.
var smsClient = new (require('../../lib/smsClient'))(config.sms);

// Synchronous tasks to execute.
var tasks = [];

// Delay between buy/sell and balance lookup.
var delay = process.env.NODE_ENV === 'production' ? 60 * 1000 : 0;

function formatDollars(number) {
    return '$' + number.toFixed(2).replace(/(\d)(?=(\d\d\d)+(?!\d))/g, '$1,');
}

// Determine if today is a holiday.
tasks.push(function(taskCallback) {
    var holidays = new Holidays('US');
    var holiday = holidays.isHoliday(new Date());

    // Holidays market is closed.
    var closedHolidays = ['Martin Luther King Day', 'Good Friday', 'Washingtons Birthday', 'Memorial Day', 'Independence Day', 'Labour Day', 'Thanksgiving Day', 'Christmas Day', 'New Years Day'];

    // Good Friday is two days before Easter.
    var goodFridayDate = new Date(usHolidays.easter(new Date().getUTCFullYear()).getTime() - 1000 * 60 * 60 * 24 * 2);
    var isGoodFriday = moment().format('YYYY-MM-DD') === moment(goodFridayDate).format('YYYY-MM-DD');

    // Determine if today is a holiday in which the market is closed.
    var isHoliday = (holiday && closedHolidays.indexOf(holiday.name.replace(/[^a-zA-Z\- ]/, '')) > -1) || isGoodFriday;

    // Do not trade in production mode on public and bank holidays.
    if (process.env.NODE_ENV === 'production' && isHoliday) {
        return taskCallback('No buy or sell activity occurred today as it is ' + ((holiday && holiday.name) || 'a holiday') + '.');
    }

    taskCallback();
});

// Request a quote.
tasks.push(function(taskCallback) {
    tradingClient.getQuote(config.symbol).then(function(data) {
        // Keep track of the quote.
        quote = data;

        taskCallback();
    }).catch(function(error) {
        taskCallback(error);
    });
});

// Request account information.
tasks.push(function(taskCallback) {
    tradingClient.getAccount().then(function(data) {
        cash = data.cash;
        buyingPower = data.buyingPower;
        accountValue = data.value;

        holdingCostBasis = data.holdingCostBasis;
        holdingQty = data.holdingQty;

        // Calculate baseInvestment.
        baseInvestment = (buyingPower + holdingCostBasis) / config.investmentDivisor;

        taskCallback();
    }).catch(function(error) {
        taskCallback(error);
    });
});

// Download and parse stock data from Yahoo.
tasks.push(function(taskCallback) {
    var now = new Date();
    var options = {
        url: 'http://real-chart.finance.yahoo.com/table.csv?s=' + config.symbol + '&a=0&b=01&c=' + (now.getUTCFullYear() - 1) + '&d=' + now.getUTCMonth() + '&e=' + now.getUTCDate() + '&f=' + now.getUTCFullYear() + '&g=d&ignore=.csv',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36'
        }
    };

    request(options, function(error, response, body) {
        if (error) {
            return taskCallback(error);
        }

        var lines = body.toString().split('\n');

        if (lines[0] !== 'Date,Open,High,Low,Close,Volume,Adj Close') {
            return taskCallback('Bad quote data.');
        }

        // Remove the header.
        lines.shift();

        lines.forEach(function(line, index) {
            if (line.length === 0) {
                return;
            }

            var lineParts = line.split(',');

            // For the "test" client, filter out days in the future beyond the current quote date.
            if (config.client === 'test' && new Date(lineParts[0]) > new Date(quote.datetime)) {
                return;
            }

            historicalQuotes.push({
                date: lineParts[0],
                close: parseFloat(lineParts[6])
            });
        });

        // Track quotes in ascending order.
        historicalQuotes.reverse();

        taskCallback();
    });
});

// Determine the number of recent large price changes.
tasks.push(function(taskCallback) {
    var previousHistoricalQuote = null;

    historicalQuotes.forEach(function(historicalQuote) {
        var percentChange = previousHistoricalQuote ? ((historicalQuote.close / previousHistoricalQuote.close) - 1) * 100 : 0;

        if (percentChange <= config.minPercentChangeBuy || percentChange >= config.maxPercentChangeBuy) {
            recentLargeChangeCounter = config.recentLargeChangeCounterStart + 1;
        }

        recentLargeChangeCounter--;
        previousHistoricalQuote = historicalQuote;
    });

    taskCallback();
});

// Sell?
tasks.push(function(taskCallback) {
    var percentChange = ((quote.price / quote.previousClosePrice) - 1) * 100;

    // Calculate the average cost basis of the holdings.
    var averageHoldingCostBasis = holdingCostBasis / holdingQty;

    // Calculate the target sell price.
    var targetSellPrice = averageHoldingCostBasis * (1 + (config.sellTriggerProfitPercentage / 100));

    // Determine whether the target sell price has been reached.
    var targetSellPriceReached = quote.price >= targetSellPrice;

    // Determine whether the stop loss threshold has been reached.
    var stopLossThresholdReached = quote.price <= averageHoldingCostBasis * (1 - (config.stopLossThreshold / 100));

    // Track cash prior to sell so that net profit can be calculated.
    var previousBuyingPower = buyingPower;

    if (holdingQty > 0 && (stopLossThresholdReached || targetSellPriceReached)) {
        tradingClient.sell(config.symbol, holdingQty).then(function() {
            // Add a multi-second delay to let things settle.
            setTimeout(function() {
                // Get account updates.
                tradingClient.getAccount().then(function(data) {
                    var netProfit = (data.buyingPower - (holdingCostBasis + previousBuyingPower)) / 2;

                    // Update the cash available.
                    cash = data.cash;
                    buyingPower = data.buyingPower;

                    // Recalculate the base investment.
                    baseInvestment = buyingPower / config.investmentDivisor;

                    activityOccurred = true;

                    // Log what happened.
                    console.log(config.symbol + '\t' + 'SELL' + '\t' + quote.datetime.match(/^\d{4}\-\d{2}\-\d{2}/)[0] + '\t' + percentChange.toFixed(2) + '%\t' + holdingQty + '\t' + formatDollars(quote.price) + '\t\t\t\t' + formatDollars(netProfit) + ' \t' + formatDollars(buyingPower) + ' (' + formatDollars(cash) + ')');

                    // Send an SMS.
                    smsClient.send(config.sms.toNumber, 'Sold ' + holdingQty + ' share(s) of ' + config.symbol + ' at ~' + formatDollars(quote.price) + ' for ' + formatDollars(netProfit) + ' profit.\n\nStock buying power is ' + formatDollars(data.buyingPower) + '.\nAccount value is ' + formatDollars(cash) + '.');

                    taskCallback();
                });
            }, delay);
        });
    }
    else {
        // Today is not an opportunity to sell.
        taskCallback();
    }
});

// Buy?
tasks.push(function(taskCallback) {
    var percentChange = ((quote.price / quote.previousClosePrice) - 1) * 100;
    var changeAction = percentChange >= 0 ? 'increased' : 'decreased';

    // Possibly buy if it's not a bad time to buy.
    if (percentChange !== 0 && recentLargeChangeCounter <= 0 && percentChange > config.minPercentChangeBuy && percentChange < config.maxPercentChangeBuy) {
        let investment = Math.sqrt(Math.abs(percentChange)) * baseInvestment;
        let qty = Math.floor(investment / quote.price);
        let costBasis = (qty * quote.price) + config.brokerage.commission;

        // Track cash prior to sell so that net profit can be calculated.
        let previousBuyingPower = buyingPower;

        if (buyingPower - costBasis <= 0) {
            return taskCallback(config.symbol + ' ' + changeAction + ' ' + percentChange.toFixed(2) + '% since previous close from ' + formatDollars(quote.previousClosePrice) + ' to ' + formatDollars(quote.price) + '. Potential investment amount exceeds balance. Consider placing a manual trade.');
        }

        // Ensure adding the holding will not go beyond the maximum investment amount.
        if (buyingPower - costBasis > 0 && qty > 0) {
            tradingClient.buy(config.symbol, qty).then(function() {
                // Add a multi-second delay to let things settle.
                setTimeout(function() {
                    tradingClient.getAccount().then(function(data) {
                        // Calculate the average cost basis of the holdings.
                        var averageHoldingCostBasis = data.holdingCostBasis / data.holdingQty;

                        // Calculate the stop loss price.
                        var stopLossPrice = averageHoldingCostBasis * (1 - (config.stopLossThreshold / 100));

                        // Calculate the target sell price.
                        var targetSellPrice = averageHoldingCostBasis * (1 + (config.sellTriggerProfitPercentage / 100));

                        // Update the cash available.
                        cash = data.cash;
                        buyingPower = data.buyingPower;

                        activityOccurred = true;

                        // Log what happened.
                        console.log(config.symbol + '\t' + 'BUY' + '\t' + quote.datetime.match(/^\d{4}\-\d{2}\-\d{2}/)[0] + '\t' + percentChange.toFixed(2) + '%\t' + qty + '\t' + formatDollars(quote.price) + '\t\t' + formatDollars(previousBuyingPower - data.buyingPower) + ' \t\t\t' + formatDollars(buyingPower));

                        // Send an SMS.
                        smsClient.send(config.sms.toNumber, config.symbol + ' ' + changeAction + ' ' + percentChange.toFixed(2) + '% since previous close from ' + formatDollars(quote.previousClosePrice) + ' to ' + formatDollars(quote.price) + '. Bought ' + qty + ' share(s) of ' + config.symbol + ' using ' + formatDollars(previousBuyingPower - data.buyingPower) + '.\n\nTarget price is ' + formatDollars(targetSellPrice) + '.\nStop loss price is ' + formatDollars(stopLossPrice) + '.\nStock buying power is ' + formatDollars(data.buyingPower) + '.\nMarket value is ' + formatDollars(data.marketValue) + '.\nAccount value is ' + formatDollars(data.value) + '.');

                        taskCallback();
                    }).catch(function(error) {
                        taskCallback(error);
                    });
                }, delay);
            }).catch(function(error) {
                taskCallback(error);
            });
        }
        else {
            taskCallback();
        }
    }
    else {
        taskCallback();
    }
});

// Execute all tasks.
async.series(tasks, function(error) {
    if (error) {
        // Send an SMS.
        return smsClient.send(config.sms.toNumber, 'Error: ' + (error.message || error));
    }

    if (!activityOccurred) {
        // Send an SMS.
        smsClient.send(config.sms.toNumber, 'No buy or sell activity occurred today.\n\nBalance is ' + formatDollars(cash) + '.\nAccount value is ' + formatDollars(accountValue) + '.');
    }
});
