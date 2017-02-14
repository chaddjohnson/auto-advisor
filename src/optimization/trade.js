'use strict';

// Environment
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

// Config
var config = require('../../config.json');

// Libraries
var async = require('async');
var moment = require('moment');

// State and data
var marginFactor = 0.8;
var baseInvestment = 0;
var holdingQuantity = 0;
var holdingCostBasis = 0;
var cash = 0;
var buyingPower = 0;
var accountValue = 0;
var quote = {};
var activityOccurred = false;

// Set up the trading client.
var tradingClient = require('../../lib/tradingClients/base').factory(config.client, config.brokerage);

// Set up the SMS client.
var smsClient = new (require('../../lib/smsClient'))(config.sms);

// Tasks to execute.
var tasks = [];

// Delay between buy/sell and balance lookup.
var delay = process.env.NODE_ENV === 'production' ? 10 * 1000 : 0;

function formatDollars(number) {
    return '$' + number.toFixed(2).replace(/(\d)(?=(\d\d\d)+(?!\d))/g, '$1,');
}

// Request a quote.
tasks.push(function(taskCallback) {
    tradingClient.getQuote(config.symbol).then(function(data) {
        var todayIsTrading = data.lastTradeDate === moment().format('YYYY-MM-DD');

        // Determine if trading is happening today.
        if (process.env.NODE_ENV === 'production' && !todayIsTrading) {
            return taskCallback('Trading is not occurring today.');
        }

        // Keep track of the quote.
        quote = data;

        taskCallback();
    }).catch(function(error) {
        taskCallback(error);
    });
});

// Request account information.
tasks.push(function(taskCallback) {
    tradingClient.getAccount().then(function(accountData) {
        tradingClient.getHoldings(config.symbol).then(function(holdingData) {
            cash = accountData.cash;
            buyingPower = accountData.buyingPower;
            accountValue = accountData.value;

            holdingCostBasis = holdingData.costBasis || 0;
            holdingQuantity = holdingData.quantity || 0;

            // Calculate the base investment.
            baseInvestment = ((buyingPower + holdingCostBasis) * marginFactor) / config.investmentDivisor;

            taskCallback();
        }).catch(function(error) {
            taskCallback(error);
        });
    }).catch(function(error) {
        taskCallback(error);
    });
});

// Sell?
tasks.push(function(taskCallback) {
    if (!holdingQuantity) {
        return taskCallback();
    }

    var percentChange = ((quote.lastPrice / quote.previousClosePrice) - 1) * 100;

    // Calculate the average cost basis of the holdings.
    var averageHoldingCostBasis = holdingCostBasis / holdingQuantity;

    // Calculate the target sell price.
    var targetSellPrice = averageHoldingCostBasis * (1 + (config.sellTriggerProfitPercentage / 100));

    // Determine whether the target sell price has been reached.
    var targetSellPriceReached = quote.lastPrice >= targetSellPrice;

    // Determine whether the stop loss threshold has been reached.
    var stopLossThresholdReached = quote.lastPrice <= averageHoldingCostBasis * (1 - (config.stopLossThreshold / 100));

    // Determine if today is a pull out date.
    var isPullOutDate = config.pullOutDates.indexOf(quote.datetime.match(/^\d{4}\-\d{2}\-\d{2}/)[0]) > -1;

    // Track cash prior to sell so that net profit can be calculated.
    var previousBuyingPower = buyingPower;

    if (holdingQuantity > 0 && (stopLossThresholdReached || targetSellPriceReached || isPullOutDate)) {
        tradingClient.sell(config.symbol, holdingQuantity).then(function() {
            // Add a multi-second delay to let things settle.
            setTimeout(function() {
                // Get account updates.
                tradingClient.getAccount().then(function(data) {
                    var netProfit = data.value - (holdingCostBasis + cash);

                    // Update the cash available.
                    cash = data.cash;
                    buyingPower = data.buyingPower;

                    // Reset holding cost basis.
                    holdingCostBasis = 0;

                    // Recalculate the base investment.
                    baseInvestment = (buyingPower * marginFactor) / config.investmentDivisor;

                    activityOccurred = true;

                    // Log what happened.
                    console.log(
                        config.symbol + '\t' +
                        'SELL' + '\t' +
                        quote.datetime.match(/^\d{4}\-\d{2}\-\d{2}/)[0] + '\t' +
                        percentChange.toFixed(2) + '%\t' +
                        holdingQuantity + '\t' +
                        formatDollars(quote.lastPrice) + '\t\t\t\t' +
                        formatDollars(netProfit) + ' \t' +
                        formatDollars(buyingPower) + ' (' + formatDollars(cash) + ')'
                    );

                    // Send an SMS.
                    smsClient.send(config.sms.toNumber,
                        'Sold ' + holdingQuantity + ' share(s) of ' + config.symbol + ' at ~' +
                        formatDollars(quote.lastPrice) + ' for ' + formatDollars(netProfit) + ' profit.' +
                        '\n\nStock buying power is ' + formatDollars(data.buyingPower) +
                        '\nAccount value is ' + formatDollars(cash)
                    );

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
    var percentChange = ((quote.lastPrice / quote.previousClosePrice) - 1) * 100;
    var changeAction = percentChange >= 0 ? 'increased' : 'decreased';

    // Determine if today is a pull out date.
    var isPullOutDate = config.pullOutDates.indexOf(quote.datetime.match(/^\d{4}\-\d{2}\-\d{2}/)[0]) > -1;

    // Possibly buy if it's not a bad time to buy.
    if (!isPullOutDate) {
        let maxHoldingCostBasis = ((buyingPower + holdingCostBasis) * (1 - marginFactor));
        let investment = Math.sqrt(Math.abs(percentChange)) * baseInvestment;
        let quantity = Math.floor(investment / quote.lastPrice);
        let costBasis = (quantity * quote.lastPrice) + config.brokerage.commission;

        // Track cash prior to sell so that net profit can be calculated.
        let previousBuyingPower = buyingPower;

        if (buyingPower - costBasis <= maxHoldingCostBasis) {
            return taskCallback(config.symbol + ' ' + changeAction + ' ' + percentChange.toFixed(2) + '% since previous close from ' + formatDollars(quote.previousClosePrice) + ' to ' + formatDollars(quote.lastPrice) + '. Potential investment amount exceeds balance. Consider placing a manual trade.');
        }

        // Ensure adding the holding will not go beyond the maximum investment amount.
        if (buyingPower - costBasis > maxHoldingCostBasis && quantity > 0) {
            tradingClient.buy(config.symbol, quantity).then(function() {
                // Add a multi-second delay to let things settle.
                setTimeout(function() {
                    // Get updated account data.
                    tradingClient.getAccount().then(function(accountData) {
                        // Get updated holding data for the symbol.
                        tradingClient.getHoldings(config.symbol).then(function(holdingData) {
                            if (!holdingData.quantity) {
                                return taskCallback('Failed to buy ' + quantity + ' shares of ' + config.symbol + '.');
                            }

                            // Calculate the average cost basis of the holdings.
                            var averageHoldingCostBasis = holdingData.costBasis / holdingData.quantity;

                            // Calculate the stop loss price.
                            var stopLossPrice = averageHoldingCostBasis * (1 - (config.stopLossThreshold / 100));

                            // Calculate the target sell price.
                            var targetSellPrice = averageHoldingCostBasis * (1 + (config.sellTriggerProfitPercentage / 100));

                            var gainLossPercentage = (holdingData.gainLoss / holdingData.costBasis) * 100;

                            // Update the cash available.
                            cash = accountData.cash;
                            buyingPower = accountData.buyingPower;

                            activityOccurred = true;

                            // Log what happened.
                            console.log(
                                config.symbol + '\t' +
                                'BUY' + '\t' +
                                quote.datetime.match(/^\d{4}\-\d{2}\-\d{2}/)[0] + '\t' +
                                percentChange.toFixed(2) + '%\t' +
                                quantity + '\t' +
                                formatDollars(quote.lastPrice) + '\t\t' +
                                formatDollars(previousBuyingPower - buyingPower) + ' \t\t\t' +
                                formatDollars(buyingPower)
                            );

                            // Send an SMS.
                            smsClient.send(config.sms.toNumber,
                                config.symbol + ' ' + changeAction + ' ' + percentChange.toFixed(2) +
                                '% since previous close from ' + formatDollars(quote.previousClosePrice) +
                                ' to ' + formatDollars(quote.lastPrice) + '. Bought ' + quantity + ' share(s) of ' +
                                config.symbol + ' using ' + formatDollars(previousBuyingPower - accountData.buyingPower) + '.' +
                                '\n\nTarget price is ' + formatDollars(targetSellPrice) +
                                '\nStop loss price is ' + formatDollars(stopLossPrice) +
                                '\nInvestment is ' + formatDollars(holdingData.costBasis) +
                                '\nStock buying power is ' + formatDollars(accountData.buyingPower) +
                                '\nAccount value is ' + formatDollars(accountData.value) +
                                '\nGain/loss is ' + formatDollars(holdingData.gainLoss) + ' (' + gainLossPercentage.toFixed(2) + '%)'
                            );

                            taskCallback();
                        }).catch(function(error) {
                            taskCallback(error);
                        });
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
        smsClient.send(config.sms.toNumber,
            'No buy or sell activity occurred today.' +
            '\n\nBalance is ' + formatDollars(cash) +
            '\nAccount value is ' + formatDollars(accountValue)
        );
    }
});
