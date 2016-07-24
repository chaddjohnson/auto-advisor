'use strict';

if (process.argv.length < 3) {
    console.log('Symbol must be specified.');
    process.exit(1);
}

// Libraries
var request = require('request');
var async = require('async');
var _ = require('lodash');

// Load config.
var config = require('./config');

// State.
var symbol = process.argv[2];
var startingCash = 0;
var baseInvestment = 0;
var lastBuyDate = 0;
var daysHeld = 0;

// Settings.
var commission = 4.95;
var investmentDivisor = 6;
var sellTriggerProfitPercentage = 2.5;
var investmentFactor = 0.8125;

function nextQuote(symbol) {
    var previousQuotePrice = 0;
    var quotePrice = 0;
    var quoteDatetime = '';
    var holdingQty = 0;
    var holdingCostBasis = 0;
    var cash = 0;

    // Synchronous tasks to execute.
    var tasks = [];

    // Request a quote quote.
    tasks.push(function(taskCallback) {
        request('http://localhost:5000/quotes/' + symbol, function(error, response, body) {
            if (error) {
                return taskCallback(error);
            }
            if (response.statusCode === 404) {
                return taskCallback('No more quotes.');
            }
            if (!body) {
                return taskCallback();
            }

            try {
                var data = JSON.parse(body).response;
            }
            catch (error) {
                return taskCallback(error);
            }

            quoteDatetime = data.quotes.quote.datetime;
            quotePrice = parseFloat(data.quotes.quote.last);
            previousQuotePrice = parseFloat(data.quotes.quote.pcls) || 0;

            taskCallback();
        });
    });

    // Request account information.
    tasks.push(function(taskCallback) {
        request('http://localhost:5000/account/' + config.tradeking.account_id, function(error, response, body) {
            if (error) {
                return taskCallback(error);
            }

            try {
                var data = JSON.parse(body).response;
            }
            catch (error) {
                return taskCallback(error);
            }

            // Set the current cash available.
            cash = parseFloat(data.accountbalance.money.cash);

            // Set the initial starting cash available.
            if (!startingCash) {
                startingCash = cash;
                baseInvestment = startingCash / investmentDivisor;
            }

            // Set the holding data.
            holdingCostBasis = parseFloat(data.accountholdings.holding.costbasis);
            holdingQty = parseFloat(data.accountholdings.holding.qty);

            taskCallback();
        });
    });

    // Sell?
    tasks.push(function(taskCallback) {
        if (!previousQuotePrice) {
            return taskCallback();
        }

        var percentChange = ((quotePrice / previousQuotePrice) - 1) * 100;

        // Calculate the average cost basis of the holdings.
        var averageHoldingCostBasis = holdingCostBasis / holdingQty;

        // Calculate the target sell price.
        var targetSellPrice = averageHoldingCostBasis * (1 + (sellTriggerProfitPercentage / 100));

        // Calculate the number of days held since the last buy.
        var daysHeld = Math.round((new Date(quoteDatetime) - lastBuyDate) / 24 / 60 / 60 / 1000);

        // Determine whether the target price has been reached.
        var targetPriceReached = quotePrice >= targetSellPrice;

        // Determine whether the holding has been held too long but the break even price has been reached.
        var heldTooLongAndBreakEvenReached = daysHeld >= 30 && quotePrice >= averageHoldingCostBasis;

        if (holdingQty > 0 && (targetPriceReached || heldTooLongAndBreakEvenReached)) {
            let requestOptions = {
                url: 'http://localhost:5000/account/' + config.tradeking.account_id + '/orders',
                method: 'POST',
                json: {
                    type: 'SELL',
                    symbol: symbol,
                    qty: holdingQty
                }
            }
            request.post(requestOptions, function(error, response, body) {
                // TODO: Add a multi-second delay here in the real trading script to let things settle.
                request('http://localhost:5000/account/' + config.tradeking.account_id, function(error, response, body) {
                    try {
                        var data = JSON.parse(body).response;
                    }
                    catch (error) {
                        return taskCallback(error);
                    }

                    var previousCash = cash;
                    var netProfit = parseFloat(data.accountbalance.money.cash) - previousCash;
                    var soldQty = holdingQty;

                    // Update cash.
                    cash = parseFloat(data.accountbalance.money.cash);

                    // Recalculate the base investment.
                    baseInvestment = cash / investmentDivisor;

                    // Reset the holding data.
                    holdingQty = 0;
                    holdingCostBasis = 0;

                    console.log(symbol + '\t' + 'SELL' + '\t' + quoteDatetime.match(/^\d{4}\-\d{2}\-\d{2}/)[0] + '\t' + percentChange.toFixed(2) + '\t' + soldQty + '\t$' + quotePrice.toFixed(4) + '\t\t\t$' + netProfit.toFixed(2) + '  \t$' + cash.toFixed(2) + '\t' + daysHeld);

                    taskCallback();
                });
            });
        }
        else {
            taskCallback();
        }
    });

    // Buy?
    tasks.push(function(taskCallback) {
        if (!previousQuotePrice) {
            return taskCallback();
        }

        var percentChange = ((quotePrice / previousQuotePrice) - 1) * 100;

        // Possibly buy if the security has decreased in value.
        if (percentChange < 0) {
            let investment = baseInvestment * (percentChange / investmentFactor) * -1;
            let qty = Math.floor(investment / quotePrice);
            let costBasis = (qty * quotePrice) + commission;

            // Ensure adding the holding will not go beyond the maximum investment amount.
            if (cash - costBasis > 0 && qty > 0) {
                let requestOptions = {
                    url: 'http://localhost:5000/account/' + config.tradeking.account_id + '/orders',
                    method: 'POST',
                    json: {
                        type: 'BUY',
                        symbol: symbol,
                        qty: qty
                    }
                };
                request.post(requestOptions, function(error, response, body) {
                    // Update the last date bought, and reset the number of days held.
                    lastBuyDate = new Date(quoteDatetime);
                    daysHeld = 0;

                    // TODO: Add a multi-second delay here in the real trading script to let things settle.
                    request('http://localhost:5000/account/' + config.tradeking.account_id, function(error, response, body) {
                        try {
                            var data = JSON.parse(body).response;
                        }
                        catch (error) {
                            return taskCallback(error);
                        }

                        // Update the cash available.
                        cash = parseFloat(data.accountbalance.money.cash);

                        // Update the holding data.
                        holdingCostBasis = parseFloat(data.accountholdings.holding.costbasis);
                        holdingQty = parseFloat(data.accountholdings.holding.qty);

                        // TODO: Output more here (e.g., the balance).
                        console.log(symbol + '\t' + 'BUY' + '\t' + quoteDatetime.match(/^\d{4}\-\d{2}\-\d{2}/)[0] + '\t' + percentChange.toFixed(2) + '\t' + qty + '\t$' + quotePrice.toFixed(4) + '  \t$' + (qty * quotePrice).toFixed(2)) + '\t\t\t\t\t$' + cash.toFixed(2);

                        taskCallback();
                    });
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

    async.series(tasks, function(error) {
        if (error) {
            return console.log(error);
        }
        setTimeout(function() {
            nextQuote(symbol);
        }, 5);
    });
}

console.log('SYMBOL\tTYPE\tDATE\t\tCHANGE\tSHARES\tSHARE PRICE\tCOST\t\tNET\t\tBALANCE\t\tDAYS HELD');
console.log('======\t======\t==============\t======\t======\t==============\t==============\t==============\t==============\t=========');

nextQuote(symbol);
