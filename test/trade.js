'use strict';

if (process.argv.length < 3) {
    console.log('Symbol must be specified.');
    process.exit(1);
}

// Libraries
var request = require('request');
var async = require('async');
var _ = require('lodash');

var symbol = process.argv[2];
var startingCashAvailable;
var investmentDivisor = 6;
var baseInvestment;
var buyTriggerChangePercentage = -1.6;
var sellTriggerProfitPercentage = 1.15;
var days = 0;
var lastBuyDate = 0;

function nextQuote(symbol) {
    var previousClosePrice;
    var currentPrice;
    var highPrice;
    var date;
    var holdings = [];
    var costBasisSum = 0;
    var shareSum = 0;
    var averageHoldingCostBasis;
    var targetSellPrice;
    var cashAvailable;
    var tasks = [];

    // Request the previous day quote.
    tasks.push(function(taskCallback) {
        request('http://localhost:5000/quotes/previous', function(error, response, body) {
            if (error) {
                return taskCallback(error);
            }
            if (!body) {
                return taskCallback();
            }

            var data = JSON.parse(body);

            if (data) {
                previousClosePrice = data.close;
            }

            taskCallback();
        });
    });

    // Request the current day quote.
    tasks.push(function(taskCallback) {
        request('http://localhost:5000/quotes/current', function(error, response, body) {
            if (error) {
                return taskCallback(error);
            }
            if (response.statusCode === 404) {
                return taskCallback('No more quotes.');
            }
            if (!body) {
                return taskCallback();
            }

            var data = JSON.parse(body);

            date = data.date;
            currentPrice = data.close;
            highPrice = data.high;

            taskCallback();
        });
    });

    // Get cash available.
    tasks.push(function(taskCallback) {
        request('http://localhost:5000/account/balance', function(error, response, body) {
            if (error) {
                return taskCallback(error);
            }

            var data = JSON.parse(body);

            // Set the current cash available.
            cashAvailable = data.cashavailable;

            // Set the initial starting cash available.
            if (!startingCashAvailable) {
                startingCashAvailable = cashAvailable;
                baseInvestment = startingCashAvailable / investmentDivisor;
            }

            taskCallback();
        });
    });

    // Get account holdings.
    tasks.push(function(taskCallback) {
        request('http://localhost:5000/account/holdings', function(error, response, body) {
            if (error) {
                return taskCallback(error);
            }

            var data = JSON.parse(body);

            holdings = data;

            taskCallback();
        });
    });

    // Sell?
    tasks.push(function(taskCallback) {
        costBasisSum = 0;
        shareSum = 0;

        holdings.forEach(function(holding) {
            costBasisSum += holding.costBasis;
            shareSum += holding.shares;
        });

        averageHoldingCostBasis = costBasisSum / shareSum;
        targetSellPrice = averageHoldingCostBasis * (1 + (sellTriggerProfitPercentage / 100));

        days = Math.round((new Date(date) - lastBuyDate) / 24 / 60 / 60 / 1000);

        let targetPriceReached = currentPrice >= targetSellPrice;
        let averageReachedAndHeldTooLong = days >= 30 && currentPrice >= averageHoldingCostBasis;

        if (holdings.length && (targetPriceReached || averageReachedAndHeldTooLong)) {
            let requestOptions = {
                url: 'http://localhost:5000/account/orders',
                method: 'POST',
                json: {
                    type: 'SELL',
                    symbol: symbol,
                    shares: shareSum
                }
            }
            request.post(requestOptions, function(error, response, body) {
                request('http://localhost:5000/account/balance', function(error, response, body) {
                    var data = JSON.parse(body);

                    let previousCashAvailable = cashAvailable;
                    let netProfit = data.cashavailable - previousCashAvailable;

                    cashAvailable = data.cashavailable;
                    baseInvestment = cashAvailable / investmentDivisor;
                    holdings = [];

                    console.log(symbol + '\t' + 'SELL' + '\t' + date + '\t' + shareSum + '\t$' + currentPrice.toFixed(4) + '\t\t\t$' + netProfit.toFixed(2) + '  \t$' + cashAvailable.toFixed(2) + '\t' + days);

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
        var percentChange = ((currentPrice / previousClosePrice) - 1) * 100;
        var currentInvestment = _.reduce(holdings, function(memo, holding) {
            return memo + (holding.pricePerShare * holding.shares);
        }, 0);

        if (percentChange < buyTriggerChangePercentage) {
            let shares = Math.floor(baseInvestment / currentPrice);

            // Ensure adding the holding will not go beyond the maximum investment amount.
            if (currentPrice * shares <= cashAvailable) {
                let requestOptions = {
                    url: 'http://localhost:5000/account/orders',
                    method: 'POST',
                    json: {
                        type: 'BUY',
                        symbol: symbol,
                        shares: shares
                    }
                };
                request.post(requestOptions, function(error, response, body) {
                    lastBuyDate = new Date(date);
                    days = 0;

                    console.log(symbol + '\t' + 'BUY' + '\t' + date + '\t' + shares + '\t$' + currentPrice.toFixed(4) + '  \t$' + (shares * currentPrice).toFixed(2));

                    taskCallback();
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

console.log('SYMBOL\tTYPE\tDATE\t\tSHARES\tSHARE PRICE\tCOST\t\tNET\t\tBALANCE');
console.log('======\t======\t==============\t======\t=============\t=============\t===========\t==============');

nextQuote(symbol);
