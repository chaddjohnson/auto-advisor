'use strict';

// Config
var config = require('../../../config.json');

// Libraries
var async = require('async');
var _ = require('lodash');
var colors = require('colors');

// Set up the trading client.
var tradingClient = require('../../../lib/tradingClients/base').factory('tradeking', config.brokerage);

// parameters.
var argv = require('yargs').argv;
var symbol = argv.symbol;
var targetProfitPercentage = parseFloat(argv.targetProfitPercentage);
var investment = parseFloat(argv.investment);

// State
var initialCash = 0;
var initialQuote = null;
var shareCount = 0;
var averagePrice = 0;
var holdingCostBasis = 0;
var targetSellPrice = 0;
var limitOrderId = '';
var stream = null;
var aborting = false;

// Tasks to execute.
var tasks = [];

// Check parameters.
if (!symbol) {
    console.error(colors.red('No symbol provided.'));
    process.exit(1);
}
if (!targetProfitPercentage) {
    console.error(colors.red('No target profit percentage provided.'));
    process.exit(1);
}

function formatDollars(number) {
    return '$' + number.toFixed(2).replace(/(\d)(?=(\d\d\d)+(?!\d))/g, '$1,');
}

// Determine day tradable balance, and get a quote (in parallel).
tasks.push(function(taskCallback) {
    var parallelTasks = [];
    var commission = 4.95;

    // Request account information.
    parallelTasks.push(function(parallelTaskCallback) {
        console.log('Requesting account information...');

        tradingClient.getAccount().then(function(data) {
            initialCash = data.cash;

            if (!investment) {
                // No investment was specified, so use all day trading buying power.
                investment = (data.dayTradingBuyingPower - commission) - 100;
            }

            // Ensure sufficient day trading buying power.
            if (investment > data.dayTradingBuyingPower) {
                return parallelTaskCallback('Investment of ' + investment + ' exceeds day trading buying power of ' + data.dayTradingBuyingPower + '.');
            }

            parallelTaskCallback();
        }).catch(function(error) {
            parallelTaskCallback(error);
        });
    });

    // Request a quote.
    parallelTasks.push(function(parallelTaskCallback) {
        console.log('Requesting quote for ' + symbol + '...');

        tradingClient.getQuote(symbol).then(function(data) {
            initialQuote = data;

            parallelTaskCallback();
        }).catch(function(error) {
            parallelTaskCallback(error);
        });
    });

    async.parallel(parallelTasks, function(error) {
        taskCallback(error);
    });
});

tasks.push(function(taskCallback) {
    console.log('Verifying bid/ask spread...');

    var bidAskSpreadMaximum = 0.000175;
    var bidAskSpread = (initialQuote.askPrice / initialQuote.bidPrice) - 1;

    // Verify the bid/ask spread is not too great.
    if (bidAskSpread > bidAskSpreadMaximum) {
        return taskCallback('Bid/ask spread of ' + bidAskSpread + ' exceeds maximum of ' + bidAskSpreadMaximum + '.');
    }

    taskCallback();
});

tasks.push(function(taskCallback) {
    var volumeInvestmentRatioMinimum = 10000;
    var volumeInvestmentRatio = Math.round((initialQuote.averageVolume * initialQuote.lastPrice) / investment);

    // Verify the volume is not too little.
    if (volumeInvestmentRatio < volumeInvestmentRatioMinimum) {
        return taskCallback('Volume investment ratio of ' + volumeInvestmentRatio + ' is too low. Minimum is ' + volumeInvestmentRatioMinimum + '.');
    }

    console.log('Volume investment ratio is ' + volumeInvestmentRatio);

    taskCallback();
});

tasks.push(function(taskCallback) {
    // Calculate the number of shares to buy.
    shareCount = Math.floor(investment / initialQuote.askPrice);

    console.log('Buying ' + shareCount + ' shares of ' + symbol + ' using ' + formatDollars(shareCount * initialQuote.askPrice) + '...');

    // Buy.
    tradingClient.buy(symbol, shareCount).then(function() {
        taskCallback();
    }).catch(function(error) {
        taskCallback(error);
    });
});

tasks.push(function(taskCallback) {
    // Check (and keep checking) whether the order has fully executed.
    console.log('Checking whether order has executed...');

    function checkBuyExecution() {
        tradingClient.getHoldings().then(function(data) {
            var holding = _.find(data, function(item) {
                return item.symbol === symbol;
            });

            if (holding && holding.quantity === shareCount) {
                averagePrice = holding.averagePrice;
                holdingCostBasis = holding.costBasis;

                console.log(holding.quantity + ' shares held at average price of ' + averagePrice.toFixed(2) + ' and cost basis of ' + formatDollars(holdingCostBasis) + '.');

                taskCallback();
            }
            else {
                setTimeout(checkBuyExecution, 500);
            }
        }).catch(function(error) {
            console.error(colors.red(error.message || error));
        });
    }

    setTimeout(checkBuyExecution, 250);
});

tasks.push(function(taskCallback) {
    // Determine the target sell price.
    targetSellPrice = Math.ceil(averagePrice * (targetProfitPercentage + 1) * 100) / 100;

    console.log('Placing sell limit order for ' + targetSellPrice + '...');

    // Create a sell limit order.
    tradingClient.sell(symbol, shareCount, targetSellPrice).then(function(data) {
        // Track the order ID.
        limitOrderId = data.orderId;

        taskCallback();
    }).catch(function(error) {
        taskCallback(error);
    });
});

// Stream quotes.
tasks.push(function(taskCallback) {
    console.log('Streaming quotes...');
    console.log();

    var targetReached = false;
    var dollarChange = 0;
    var percentChange = 0;
    var profitLoss = 0;

    console.log('    symbol\tshares\tbid\task\tlast\ttarget\taverage\tchange\t\tprofit/loss');
    process.stdout.cursorTo(4);

    stream = tradingClient.stream(symbol);

    stream.on('data', function(data) {
        if (aborting) {
            return;
        }

        dollarChange = data.bidPrice - averagePrice;
        percentChange = ((data.bidPrice / averagePrice) - 1) * 100;
        profitLoss = ((data.bidPrice / averagePrice) - 1) * holdingCostBasis;

        process.stdout.cursorTo(4);
        process.stdout.write('                                                                                                    ');

        process.stdout.cursorTo(4);
        process.stdout.write(colors.bold.blue(symbol) + '\t\t');
        process.stdout.write(colors.bold(shareCount) + '\t');
        process.stdout.write(colors.bold(data.bidPrice.toFixed(2)) + '\t');
        process.stdout.write(colors.bold(data.askPrice.toFixed(2)) + '\t');
        process.stdout.write(colors.bold(data.lastPrice.toFixed(2)) + '\t');
        process.stdout.write(colors.bold(targetSellPrice.toFixed(2)) + '\t');
        process.stdout.write(colors.bold(averagePrice.toFixed(2)) + '\t');

        if (percentChange > 0) {
            process.stdout.write(colors.bold.green(dollarChange.toFixed(2) + ' (' + percentChange.toFixed(2) + '%)\t'));
            process.stdout.write(colors.bold.green(formatDollars(profitLoss)));
        }
        else if (percentChange < 0) {
            process.stdout.write(colors.bold.red(dollarChange.toFixed(2) + ' (' + percentChange.toFixed(2) + '%)\t'));
            process.stdout.write(colors.bold.red(formatDollars(profitLoss)));
        }
        else {
            process.stdout.write(colors.bold(dollarChange.toFixed(2) + ' (' + percentChange.toFixed(2) + '%)\t'));
            process.stdout.write(colors.bold(formatDollars(profitLoss)));
        }
    });

    stream.on('error', function(error) {
        console.error('\n' + colors.red(error.message || error));
    });
    stream.on('close', function() {
        if (targetReached) {
            process.stdout.write('\n');
            taskCallback();
        }
        else {
            taskCallback('Connection closed');
        }
    });

    function checkSellExecution() {
        tradingClient.getHoldings().then(function(data) {
            var holding = _.find(data, function(item) {
                return item.symbol === symbol;
            });

            if (holding) {
                setTimeout(checkSellExecution, 1000);
            }
            else {
                // Target reached!
                targetReached = true;

                // Terminate streaming.
                stream.abort();
            }
        }).catch(function(error) {
            console.error(colors.red(error.message || error));
        });
    }

    // Periodically check whether sell limit executed.
    checkSellExecution();
});

tasks.push(function(taskCallback) {
    tradingClient.getAccount().then(function(data) {
        // Calculate the profit/loss.
        var profitLoss = data.cash - initialCash;

        console.log();

        if (profitLoss > 0) {
            console.log('Profit/loss: ' + colors.bold.green(formatDollars(profitLoss)));
        }
        else if (profitLoss < 0) {
            console.log('Profit/loss: ' + colors.bold.red(formatDollars(profitLoss)));
        }
        else {
            console.log('Profit/loss: ' + colors.bold(formatDollars(profitLoss)));
        }

        taskCallback();
    }).catch(function(error) {
        taskCallback(error);
    });
});

async.series(tasks, function(error) {
    if (error) {
        console.error('\n' + colors.red(error.message || error));
    }

    // Ensure the script actually terminates.
    process.exit();
});

process.on('SIGINT', function() {
    if (!limitOrderId) {
        // No limit order has been placed, so no order cancelation is necessary.
        return process.exit();
    }

    if (!aborting) {
        console.log('\nAborting trade...');

        aborting = true;

        // Cancel the limit order.
        tradingClient.cancelOrder(limitOrderId, symbol).then(function() {
            console.log('Sell limit order canceled.');

            // Wait for the cancelation to complete.
            setTimeout(function() {
                console.log('Placing sell market order...');

                // Create a market sell order.
                tradingClient.sell(symbol, shareCount).then(function() {
                    console.log('Sell market order placed successfully.');
                }).catch(function(error) {
                    console.error(colors.red('Unable to place sell market order: ' + (error.message || error)));
                }).finally(function() {
                    process.exit();
                });
            }, 1000);
        }).catch(function(error) {
            console.error(colors.red('Unable to cancel sell limit order: ' + (error.message || error)));
        });
    }
});
