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
var activityOccurred = false;

// Set up the trading client.
var tradingClient = require('../../lib/tradingClients/base').factory(config.client, config.brokerage);

// Set up the SMS client;
var smsClient = new (require('../../lib/smsClient'))(config.sms);

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

    // Determine whether the stop loss threshold has been reached.
    var stopLossThresholdReached = price <= averageHoldingCostBasis * (1 - (config.stopLossThreshold / 100));

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

// Buy?
tasks.push(function(taskCallback) {
    var percentChange = ((price / previousClosePrice) - 1) * 100;

    // Possibly buy if the security has decreased in value.
    if (percentChange > 0) {
        let investment = baseInvestment * (percentChange / config.investmentFactor);
        let qty = Math.floor(investment / price);
        let costBasis = (qty * price) + config.brokerage.commission;

        // Track cash prior to sell so that net profit can be calculated.
        let previousCash = cash;

        if (cash - costBasis <= 0) {
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

                        // Calculate the stop loss price.
                        var stopLossPrice = averageHoldingCostBasis * (1 - (config.stopLossThreshold / 100));

                        // Update the cash available.
                        cash = data.cash;

                        activityOccurred = true;

                        // Log what happened.
                        console.log(config.symbol + '\t' + 'BUY' + '\t' + quoteDatetime.match(/^\d{4}\-\d{2}\-\d{2}/)[0] + '\t' + percentChange.toFixed(2) + '%\t' + qty + '\t' + formatDollars(price) + '\t\t' + formatDollars(previousCash - cash) + ' \t\t\t' + formatDollars(cash));

                        // Send an SMS.
                        smsClient.send(config.sms.toNumber, config.symbol + ' increased ' + percentChange.toFixed(2) + '% since previous close from ' + formatDollars(previousClosePrice) + ' to ' + formatDollars(price) + '. Successfully bought ' + qty + ' shares of ' + config.symbol + ' using ' + formatDollars(previousCash - cash) + '. Stop loss price is ' + formatDollars(stopLossPrice) + '. New balance is ' + formatDollars(cash) + '.');

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
