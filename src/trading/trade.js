'use strict';

// Environment
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

// Config
var config = require('../../config');

// Libraries
var _ = require('lodash');
var async = require('async');
var request = require('request');
var Holidays = require('date-holidays');
var RsiIndicator = require('../../lib/indicators/rsi');

// State and data
var baseInvestment = 0;
var lastBuyDate = 0;
var daysHeld = 0;
var holdingQty = 0;
var holdingCostBasis = 0;
var cash = 0;
var quote = {};
var historicalQuotes = [];
var activityOccurred = false;

// Set up the trading client.
var tradingClient = require('../../lib/tradingClients/base').factory(config.client, config.brokerage);

// Set up the SMS client.
var smsClient = new (require('../../lib/smsClient'))(config.sms);

// Set up indicators.
var indicators = {
    rsi: new RsiIndicator({length: 7}, {rsi: 'rsi'})
};

// Synchronous tasks to execute.
var tasks = [];

// Delay between buy/sell and balance lookup.
var delay = process.env.NODE_ENV === 'production' ? 30 * 1000 : 0;

function formatDollars(number) {
    return '$' + number.toFixed(2).replace(/(\d)(?=(\d\d\d)+(?!\d))/g, '$1,');
}

// Determine if today is a holiday.
tasks.push(function(taskCallback) {
    var holidays = new Holidays('US');
    var holiday = holidays.isHoliday(new Date());

    // Do not trade in production mode on public and bank holidays.
    if (process.env.NODE_ENV === 'production' && holiday && (holiday.type === 'public' || holiday.type === 'bank')) {
        return taskCallback('No buy or sell activity occurred today as it is ' + (holiday.name || 'a holiday') + '.');
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

// Request history.
tasks.push(function(taskCallback) {
    tradingClient.getBuyHistory(config.symbol).then(function(data) {
        if (data && data.length) {
            // Find the last buy trade date for the symbol.
            lastBuyDate = new Date(data[0].date.match(/^\d{4}\-\d{2}\-\d{2}/)[0] + 'T12:00:00Z');

            // Calculate the number of days held since the last buy.
            daysHeld = Math.round((new Date(quote.datetime) - lastBuyDate) / 24 / 60 / 60 / 1000);
        }
        else {
            daysHeld = 0;
        }

        taskCallback();
    }).catch(function(error) {
        taskCallback(error);
    });
});

// Request account information.
tasks.push(function(taskCallback) {
    tradingClient.getAccount().then(function(data) {
        cash = data.cash;

        holdingCostBasis = data.holdingCostBasis;
        holdingQty = data.holdingQty;

        // Calculate baseInvestment.
        baseInvestment = (cash + holdingCostBasis) / config.investmentDivisor;

        // If no positions are held, then zero out the number of days held.
        if (holdingQty === 0) {
            daysHeld = 0;
        }

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
                close: parseFloat(lineParts[4])
            });
        });

        // Track quotes in ascending order.
        historicalQuotes.reverse();

        taskCallback();
    });
});

// Tick indicators.
tasks.push(function(taskCallback) {
    var index = 0;
    var cumulativeHistoricalQuotes = [];

    // Go through all historical quotes available.
    historicalQuotes.forEach(function(historicalQuote) {
        cumulativeHistoricalQuotes.push(historicalQuote);

        // Go through each indicator.
        for (index in indicators) {
            let indicatorProperty = '';

            // Get output mappings.
            let indicatorOutputs = indicators[index].getOutputMappings();

            // Set data for indicators.
            indicators[index].setData(cumulativeHistoricalQuotes);

            // Tick the indicator.
            let indicatorTickValues = indicators[index].tick();

            // Grab each output for the indicator.
            for (indicatorProperty in indicatorOutputs) {
                if (indicatorTickValues && typeof indicatorTickValues[indicatorOutputs[indicatorProperty]] === 'number') {
                    quote[indicatorOutputs[indicatorProperty]] = indicatorTickValues[indicatorOutputs[indicatorProperty]];
                }
                else {
                    quote[indicatorOutputs[indicatorProperty]] = '';
                }
            }
        }
    });

    taskCallback();
});

// Sell?
tasks.push(function(taskCallback) {
    var percentChange = ((quote.price / quote.previousClosePrice) - 1) * 100;

    // Calculate the average cost basis of the holdings.
    var averageHoldingCostBasis = holdingCostBasis / holdingQty;

    // Determine whether the stop loss threshold has been reached.
    var stopLossThresholdReached = quote.price <= averageHoldingCostBasis * (1 - (config.stopLossThreshold / 100));

    // Determine whether the holding has been held too long.
    var heldTooLong = daysHeld >= config.maxDaysHeld;

    // Track cash prior to sell so that net profit can be calculated.
    var previousCash = cash;

    if (holdingQty > 0 && (stopLossThresholdReached || heldTooLong)) {
        tradingClient.sell(config.symbol, holdingQty).then(function() {
            // Add a multi-second delay to let things settle.
            setTimeout(function() {
                // Get account updates.
                tradingClient.getAccount().then(function(data) {
                    var netProfit = data.cash - (holdingCostBasis + previousCash);

                    // Update the cash available.
                    cash = data.cash;

                    // Recalculate the base investment.
                    baseInvestment = cash / config.investmentDivisor;

                    activityOccurred = true;

                    // Log what happened.
                    console.log(config.symbol + '\t' + 'SELL' + '\t' + quote.datetime.match(/^\d{4}\-\d{2}\-\d{2}/)[0] + '\t' + percentChange.toFixed(2) + '%\t' + holdingQty + '\t' + formatDollars(quote.price) + '\t\t\t\t' + formatDollars(netProfit) + ' \t' + formatDollars(cash) + '\t' + daysHeld);

                    // Send an SMS.
                    smsClient.send(config.sms.toNumber, 'Successfully sold ' + holdingQty + ' shares of ' + config.symbol + ' at ~' + formatDollars(quote.price) + ' for ' + formatDollars(netProfit) + ' profit. New balance is ' + formatDollars(cash) + '.');

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

    // Possibly buy if the security has decreased in value.
    if (percentChange > 0 && quote.rsi < 70) {
        let investment = baseInvestment * (percentChange / config.investmentFactor);
        let qty = Math.floor(investment / quote.price);
        let costBasis = (qty * quote.price) + config.brokerage.commission;

        // Track cash prior to sell so that net profit can be calculated.
        let previousCash = cash;

        if (cash - costBasis <= 0) {
            return taskCallback(config.symbol + ' dropped ' + percentChange.toFixed(2) + '% since previous close from ' + formatDollars(quote.previousClosePrice) + ' to ' + formatDollars(quote.price) + '. Potential investment amount exceeds balance. Consider placing a manual trade.');
        }

        // Ensure adding the holding will not go beyond the maximum investment amount.
        if (cash - costBasis > 0 && qty > 0) {
            tradingClient.buy(config.symbol, qty).then(function() {
                // Add a multi-second delay to let things settle.
                setTimeout(function() {
                    tradingClient.getAccount().then(function(data) {
                        // Calculate the average cost basis of the holdings.
                        var averageHoldingCostBasis = data.holdingCostBasis / data.holdingQty;

                        // Calculate the stop loss price.
                        var stopLossPrice = averageHoldingCostBasis * (1 - (config.stopLossThreshold / 100));

                        // Update the cash available.
                        cash = data.cash;

                        activityOccurred = true;

                        // Log what happened.
                        console.log(config.symbol + '\t' + 'BUY' + '\t' + quote.datetime.match(/^\d{4}\-\d{2}\-\d{2}/)[0] + '\t' + percentChange.toFixed(2) + '%\t' + qty + '\t' + formatDollars(quote.price) + '\t\t' + formatDollars(previousCash - cash) + ' \t\t\t' + formatDollars(cash));

                        // Send an SMS.
                        smsClient.send(config.sms.toNumber, config.symbol + ' increased ' + percentChange.toFixed(2) + '% since previous close from ' + formatDollars(quote.previousClosePrice) + ' to ' + formatDollars(quote.price) + '. Successfully bought ' + qty + ' shares of ' + config.symbol + ' using ' + formatDollars(previousCash - cash) + '. Stop loss price is ' + formatDollars(stopLossPrice) + '. New balance is ' + formatDollars(cash) + '.');

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
        return smsClient.send(config.sms.toNumber, error.message || error);
    }

    if (!activityOccurred) {
        // Send an SMS.
        smsClient.send(config.sms.toNumber, 'No buy or sell activity occurred today. Balance is ' + formatDollars(cash) + '.');
    }
});
