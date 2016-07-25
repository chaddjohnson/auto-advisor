'use strict';

// Environment
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

// Config
var config = require('../../config');

// Libraries
var _ = require('lodash');
var async = require('async');
var tradingClient = require('../../lib/tradingClients/base').factory(config.client, config.brokerage);

// State
var baseInvestment = 0;
var lastBuyDate = 0;
var daysHeld = 0;
var previousClosePrice = 0;
var price = 0;
var quoteDatetime = '';
var holdingQty = 0;
var holdingCostBasis = 0;
var cash = 0;

// Synchronous tasks to execute.
var tasks = [];

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
        if (data.length) {
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
    var heldTooLongAndBreakEvenReached = daysHeld >= 30 && price >= averageHoldingCostBasis;

    if (holdingQty > 0 && (targetPriceReached || heldTooLongAndBreakEvenReached)) {
        tradingClient.sell(config.symbol, holdingQty).then(function() {
            // Add a multi-second delay to let things settle.
            setTimeout(function() {
                // Get account updates.
                tradingClient.getAccount().then(function(data) {
                    var previousCash = cash;
                    var netProfit = data.cash - previousCash;

                    // Update the cash available.
                    cash = data.cash;

                    // Recalculate the base investment.
                    baseInvestment = cash / config.investmentDivisor;

                    // Log what happened.
                    console.log(config.symbol + '\t' + 'SELL' + '\t' + quoteDatetime.match(/^\d{4}\-\d{2}\-\d{2}/)[0] + '\t' + percentChange.toFixed(2) + '\t' + holdingQty + '\t$' + price.toFixed(4) + '\t\t\t$' + netProfit.toFixed(2) + '  \t$' + cash.toFixed(2) + '\t' + daysHeld);

                    // TODO: Send an SMS.
                    // ...

                    taskCallback();
                });
            }, 30 * 1000);  // 30 seconds
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
    if (percentChange < 0) {
        let investment = baseInvestment * (percentChange / config.investmentFactor) * -1;
        let qty = Math.floor(investment / price);
        let costBasis = (qty * price) + config.brokerage.commission;

        // Ensure adding the holding will not go beyond the maximum investment amount.
        if (cash - costBasis > 0 && qty > 0) {
            tradingClient.buy(config.symbol, qty).then(function() {
                // Add a multi-second delay to let things settle.
                setTimeout(function() {
                    tradingClient.getAccount().then(function(data) {
                        // Update the cash available.
                        cash = data.cash;

                        // Log what happened.
                        console.log(config.symbol + '\t' + 'BUY' + '\t' + quoteDatetime.match(/^\d{4}\-\d{2}\-\d{2}/)[0] + '\t' + percentChange.toFixed(2) + '\t' + qty + '\t$' + price.toFixed(4) + '  \t$' + (qty * price).toFixed(2)) + '\t\t\t\t\t$' + cash.toFixed(2);

                        // TODO: Send an SMS.
                        // ...

                        taskCallback();
                    }).catch(function(error) {
                        taskCallback(error);
                    });
                }, 30 * 1000);  // 30 seconds
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
        // Log what happened.
        console.log(error);

        // TODO: Send an SMS.
        // ...

        return;
    }
});
