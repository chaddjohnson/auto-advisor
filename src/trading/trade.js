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

// State and data
var baseInvestment = 0;
var lastBuyDate = 0;
var daysHeld = 0;
var previousClosePrice = 0;
var price = 0;
var quoteDatetime = '';
var holdingQty = 0;
var holdingCostBasis = 0;
var cash = 0;
var quotes = [];
var buyHistory = [];
var sequentialBuyDays = 0;
var sequentialIncreaseDays = 0;
var activityOccurred = false;

// Set up the trading client.
var tradingClient = require('../../lib/tradingClients/base').factory(config.client, config.brokerage);

// Set up the SMS client;
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

    // Do not trade in production mode on public and bank holidays.
    if (process.env.NODE_ENV === 'production' && holiday && (holiday.type === 'public' || holiday.type === 'bank')) {
        return taskCallback('No buy or sell activity occurred today as it is ' + (holiday.name || 'a holiday') + '.');
    }

    taskCallback();
});

// Request a quote.
tasks.push(function(taskCallback) {
    tradingClient.getQuote(config.symbol).then(function(data) {
        quoteDatetime = data.datetime;
        price = data.price;
        previousClosePrice = data.previousClosePrice;

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
            daysHeld = Math.round((new Date(quoteDatetime) - lastBuyDate) / 24 / 60 / 60 / 1000);
        }
        else {
            daysHeld = 0;
        }

        buyHistory = data || [];

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

// Sell?
tasks.push(function(taskCallback) {
    var percentChange = ((price / previousClosePrice) - 1) * 100;

    // Calculate the average cost basis of the holdings.
    var averageHoldingCostBasis = holdingCostBasis / holdingQty;

    // Calculate the target sell price.
    var targetSellPrice = averageHoldingCostBasis * (1 + (config.sellTriggerProfitPercentage / 100));

    // Determine whether the target price has been reached.
    var targetPriceReached = price >= targetSellPrice;

    // Determine whether the holding has been held too long but the break even price has been reached.
    var heldTooLongAndBreakEvenReached = daysHeld >= config.maxDaysHeld && price >= averageHoldingCostBasis;

    // Track cash prior to sell so that net profit can be calculated.
    var previousCash = cash;

    if (holdingQty > 0 && (targetPriceReached || heldTooLongAndBreakEvenReached)) {
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
                    console.log(config.symbol + '\t' + 'SELL' + '\t' + quoteDatetime.match(/^\d{4}\-\d{2}\-\d{2}/)[0] + '\t' + percentChange.toFixed(2) + '%\t' + holdingQty + '\t' + formatDollars(price) + '\t\t\t\t' + formatDollars(netProfit) + ' \t' + formatDollars(cash) + '\t' + daysHeld);

                    // Send an SMS.
                    smsClient.send(config.sms.toNumber, 'Successfully sold ' + holdingQty + ' shares of ' + config.symbol + ' at ~' + formatDollars(price) + ' for ' + formatDollars(netProfit) + ' profit. New balance is ' + formatDollars(cash) + '.');

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

// Download and parse stock data from Yahoo.
tasks.push(function(taskCallback) {
    // Do nothing if there are no positions held.
    if (holdingQty === 0) {
        return taskCallback();
    }

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

            quotes.push({
                date: lineParts[0],
                close: parseFloat(lineParts[4])
            });
        });

        taskCallback();
    });
});

// Count sequential increase days.
tasks.push(function(taskCallback) {
    // Do nothing if there are no positions held.
    if (holdingQty === 0) {
        return taskCallback();
    }

    var countingDone = false;
    var previousSequentialQuote = null;

    // Iterate through quotes to determine the number of sequential increase days.
    quotes.forEach(function(quote) {
        if (countingDone) {
            return;
        }
        if (!previousSequentialQuote) {
            previousSequentialQuote = quote;
            return;
        }

        var percentChange = ((previousSequentialQuote.close / quote.close) - 1) * 100;

        if (percentChange > 0) {
            sequentialIncreaseDays++;
        }
        else {
            countingDone = true;
        }

        previousSequentialQuote = quote;
    });

    taskCallback();
});

// Count sequential buy days.
tasks.push(function(taskCallback) {
    // Do nothing if there are no positions held.
    if (holdingQty === 0) {
        return taskCallback();
    }

    // Do nothing if there is no buy history.
    if (!buyHistory || buyHistory.length === 0) {
        return taskCallback();
    }

    var countingDone = false;
    var buyQuoteIndex = -1;

    // Find the quote index of the most recent buy.
    quotes.forEach(function(quote, index) {
        if (quote.date === buyHistory[0].date.match(/^\d{4}\-\d{2}\-\d{2}/)[0]) {
            buyQuoteIndex = index;
        }
    });

    buyHistory.forEach(function(historyItem, index) {
        if (countingDone) {
            return;
        }
        if (!quotes[buyQuoteIndex]) {
            return;
        }

        if (quotes[buyQuoteIndex].date === historyItem.date.match(/^\d{4}\-\d{2}\-\d{2}/)[0]) {
            sequentialBuyDays++;
        }
        else {
            countingDone = true;
        }

        buyQuoteIndex++;
    });

    // Zero out the sequential buy days if the sequential increase days is high enough.
    if (sequentialIncreaseDays >= 2) {
        sequentialBuyDays = 0;
    }

    taskCallback();
});

// Buy?
tasks.push(function(taskCallback) {
    var percentChange = ((price / previousClosePrice) - 1) * 100;

    // Possibly buy if the security has decreased in value.
    if (percentChange < 0 && sequentialBuyDays < 4) {
        let investment = baseInvestment * (percentChange / config.investmentFactor) * -1;
        let qty = Math.floor(investment / price);
        let costBasis = (qty * price) + config.brokerage.commission;

        // Track cash prior to sell so that net profit can be calculated.
        let previousCash = cash;

        if (investment > cash) {
            return taskCallback(config.symbol + ' dropped ' + percentChange.toFixed(2) + '% since previous close from ' + formatDollars(previousClosePrice) + ' to ' + formatDollars(price) + '. Potential investment amount exceeds balance. Consider placing a manual trade.');
        }

        // Ensure adding the holding will not go beyond the maximum investment amount.
        if (cash - costBasis > 0 && qty > 0) {
            tradingClient.buy(config.symbol, qty).then(function() {
                // Add a multi-second delay to let things settle.
                setTimeout(function() {
                    tradingClient.getAccount().then(function(data) {
                        // Calculate the average cost basis of the holdings.
                        var averageHoldingCostBasis = data.holdingCostBasis / data.holdingQty;

                        // Calculate the target sell price.
                        var targetSellPrice = averageHoldingCostBasis * (1 + (config.sellTriggerProfitPercentage / 100));

                        // If the holding has been held too long, then the target price is the break even price.
                        if (daysHeld >= config.maxDaysHeld) {
                            targetSellPrice = averageHoldingCostBasis;
                        }

                        // Update the cash available.
                        cash = data.cash;

                        activityOccurred = true;

                        // Log what happened.
                        console.log(config.symbol + '\t' + 'BUY' + '\t' + quoteDatetime.match(/^\d{4}\-\d{2}\-\d{2}/)[0] + '\t' + percentChange.toFixed(2) + '%\t' + qty + '\t' + formatDollars(price) + '\t\t' + formatDollars(previousCash - cash) + ' \t\t\t' + formatDollars(cash));

                        // Send an SMS.
                        smsClient.send(config.sms.toNumber, config.symbol + ' dropped ' + percentChange.toFixed(2) + '% since previous close from ' + formatDollars(previousClosePrice) + ' to ' + formatDollars(price) + '. Successfully bought ' + qty + ' shares of ' + config.symbol + ' using ' + formatDollars(previousCash - cash) + '. Target price is ' + formatDollars(targetSellPrice) + '. New balance is ' + formatDollars(cash) + '.');

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
        smsClient.send(config.sms.toNumber, error.message || error);

        return;
    }

    if (!activityOccurred) {
        // Send an SMS.
        smsClient.send(config.sms.toNumber, 'No buy or sell activity occurred today. Balance is ' + formatDollars(cash) + '.');
    }
});
