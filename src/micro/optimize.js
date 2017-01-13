'use strict';

// Libraries
var util = require('util');
var colors = require('colors');
var _ = require('lodash');
var async = require('async');
var mongoose = require('mongoose');
var moment = require('moment');
var GeneticAlgorithm = require('geneticalgorithm');
var Tick = require('../../lib/models/tick');
var BollingerBandsIndicator = require('../../lib/indicators/bollingerBands');

// Get parameters.
var argv = require('yargs').argv;
var symbol = argv.symbol;
var populationSize = parseInt(argv.populationSize);
var evolutionCount = parseInt(argv.evolutionCount);
var investment = parseFloat(argv.investment);

// Check parameters.
if (!symbol) {
    console.log(colors.red('Symbol must be specified.'));
    process.exit(1);
}
if (!populationSize) {
    console.error(colors.red('No population size provided.'));
    process.exit(1);
}
if (!evolutionCount) {
    console.error(colors.red('No evolution count provided.'));
    process.exit(1);
}
if (!investment) {
    console.error(colors.red('No investment provided.'));
    process.exit(1);
}

// State
var population = [];
var ticks = [];
var minuteTicks = [];
var bestPhenotype = null;

// Synchronous tasks
var tasks = [];

// Connect to the database.
mongoose.connect('mongodb://localhost/trading');
mongoose.connection.on('error', function(error) {
    console.error(colors.red('Database connection error: ' + error));
});

// Load data.
tasks.push(function(taskCallback) {
    var constraints = {
        symbol: symbol,
        createdAt: {
            $gte: new Date('2016-11-18T00:00:00.000Z'),
            $lte: new Date('2016-12-05T23:59:59.000Z'),
        }
    };

    Tick.find(constraints).sort({createdAt: 1}).exec(function(error, documents) {
        if (error) {
            return taskCallback(error);
        }

        ticks = documents;
        taskCallback();
    });
});

// Group ticks into minute ticks.
tasks.push(function(taskCallback) {
    console.log('Grouping ticks...');

    var previousMinute = -1;
    var previousTick = null;
    var openPrice = 0;
    var highPrice = 0;
    var lowPrice = 99999;

    ticks.forEach(function(tick) {
        if (tick.createdAt.getMinutes() !== previousMinute && previousMinute !== -1) {
            minuteTicks.push({
                open: openPrice,
                high: highPrice,
                low: lowPrice,
                close: previousTick.lastPrice,
                timestamp: new Date(moment(previousTick.createdAt).format('YYYY-MM-DD HH:mm:59'))
            });

            openPrice = 0;
            highPrice = 0;
            lowPrice = 99999;
        }

        if (!openPrice) {
            openPrice = tick.lastPrice;
        }
        if (tick.lastPrice < lowPrice) {
            lowPrice = tick.lastPrice;
        }
        if (tick.lastPrice > highPrice) {
            highPrice = tick.lastPrice;
        }

        previousTick = JSON.parse(JSON.stringify(tick));
        previousMinute = tick.createdAt.getMinutes();
    });

    taskCallback();
});

// Create population.
tasks.push(function(taskCallback) {
    // // Create an initial, randomized population.
    _.times(generateRandomNumber(1, 10), function(index) {
        population.push({
            bollingerBandsLength: generateRandomNumber(10, 30),
            bollingerBandsStandardDeviation: generateRandomNumber(1.0, 3.0, 2),
            targetProfitPercentage: generateRandomNumber(1.001, 1.007, 5),
            stopLossPercentage: generateRandomNumber(0.995, 0.99999, 5)
        });
    });

    taskCallback();
});

// Run the algorithm.
tasks.push(function(taskCallback) {
    console.log('Optimizing for ' + symbol);

    // Initialize the machine learning algorithm.
    var geneticAlgorithm = GeneticAlgorithm({
        mutationFunction: mutationFunction,
        crossoverFunction: crossoverFunction,
        fitnessFunction: fitnessFunction,
        // doesABeatBFunction: competitionFunction,
        population: population,
        populationSize: populationSize
    });

    _.times(evolutionCount, function(index) {
        process.stdout.cursorTo(0);
        process.stdout.write('Evolution ' + (index + 1) + ' of ' + evolutionCount + '...');

        geneticAlgorithm.evolve();
    });

    bestPhenotype = geneticAlgorithm.best();
    taskCallback();
});

async.series(tasks, function(error) {
    if (error) {
        return console.log(colors.red(error));
    }

    // Show the results.
    process.stdout.write('\n');
    console.log(colors.blue(JSON.stringify(backtest(bestPhenotype, true))));
    console.log(colors.green(JSON.stringify(bestPhenotype)));
    process.stdout.write('\n');

    process.exit();
});

function generateRandomNumber(min, max, decimals) {
    decimals = decimals || 0;

    return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function mutationFunction(oldPhenotype) {
    var resultPhenotype = _.clone(oldPhenotype);

    // Select a random property to mutate.
    var propertyMin = 0;
    var propertyMax = 4;
    var propertyIndex = Math.floor(Math.random() * ((propertyMax - propertyMin) + 1)) + propertyMin;

    // Use oldPhenotype and some random function to make a change to the phenotype.
    switch (propertyIndex) {
        case 0:
            resultPhenotype.bollingerBandsLength = generateRandomNumber(10, 30);
            break;

        case 1:
            resultPhenotype.bollingerBandsStandardDeviation = generateRandomNumber(1.0, 3.0, 2);
            break;

        case 2:
            resultPhenotype.targetProfitPercentage = generateRandomNumber(1.001, 1.007, 5);
            break;

        case 3:
            resultPhenotype.stopLossPercentage = generateRandomNumber(0.995, 0.99999, 5);
            break;
    }

    return resultPhenotype;
}

function crossoverFunction(phenotypeA, phenotypeB) {
    var result1 = _.clone(phenotypeA);
    var result2 = _.clone(phenotypeB);

    // Use phenotypeA and B to create phenotype result 1 and 2.

    if (generateRandomNumber(0, 1)) {
        result1.bollingerBandsLength = phenotypeB.bollingerBandsLength;
        result2.bollingerBandsLength = phenotypeA.bollingerBandsLength;
    }

    if (generateRandomNumber(0, 1)) {
        result1.bollingerBandsStandardDeviation = phenotypeB.bollingerBandsStandardDeviation;
        result2.bollingerBandsStandardDeviation = phenotypeA.bollingerBandsStandardDeviation;
    }

    if (generateRandomNumber(0, 1)) {
        result1.targetProfitPercentage = phenotypeB.targetProfitPercentage;
        result2.targetProfitPercentage = phenotypeA.targetProfitPercentage;
    }

    if (generateRandomNumber(0, 1)) {
        result1.stopLossPercentage = phenotypeB.stopLossPercentage;
        result2.stopLossPercentage = phenotypeA.stopLossPercentage;
    }

    return [result1, result2];
}

function fitnessFunction(phenotype) {
    var result = null;
    var fitness = 0;

    result = backtest(phenotype);

    if (result.profit === 0) {
        return 0;
    }

    if (result.loss > 0) {
        fitness = (result.profit / result.loss) * result.profit;
    }
    else {
        fitness = result.profit * result.profit;
    }

    // Use phenotype and possibly some other information to determine
    // the fitness number. Higher is better, lower is worse.

    return fitness;
}

// function competitionFunction(phenotypeA, phenotypeB) {
//     // If too genetically similar to consider...
//     if (yourDiversityFunc(phenotypeA, phenotypeB) > MINIMUM_SIMILARITY) {
//        return false;
//     }

//     // If phenotypeA isn't better than phenotypeB...
//     if (fitnessFunction(phenotypeA) < fitnessFunction(phenotypeB)) {
//         return false;
//     }

//     // phenotypeA beats phenotypeB.
//     return true;
// }

function backtest(phenotype, showTrades) {
    showTrades = showTrades || false;

    var commission = 4.95;
    var balance = investment;
    var startingBalance = balance;
    var previousBalance = balance;
    var tradeCount = 0;
    var loss = 0;
    var shares = 0;
    var costBasis = 0;
    var averagePrice = 0;
    var previousTick = null;
    var previousBollingerBandsValues = null;
    var cumulativeTicks = [];
    var cumulativeTickCount = 0;
    var bollingerBandsIndicator = new BollingerBandsIndicator(
        {
            length: phenotype.bollingerBandsLength,
            deviations: phenotype.bollingerBandsStandardDeviation
        },
        {
            middle: 'middle',
            upper: 'upper',
            lower: 'lower'
        }
    );

    minuteTicks.forEach(function(tick, index) {
        if (!previousTick) {
            previousTick = tick;
            return;
        }

        cumulativeTicks.push(tick);
        cumulativeTickCount = cumulativeTicks.length;

        // Enough data?
        if (cumulativeTickCount < phenotype.bollingerBandsLength) {
            return;
        }

        // Too much data?
        while (cumulativeTickCount > phenotype.bollingerBandsLength) {
            cumulativeTicks.shift();
            cumulativeTickCount--;
        }

        bollingerBandsIndicator.setData(cumulativeTicks);

        var bollingerBandsValues = bollingerBandsIndicator.tick();
        var dayTradingBuyingPower = balance * 4;
        var justBought = false;
        var isTooLateToTrade = tick.timestamp.getHours() === 14 && tick.timestamp.getMinutes() >= 30;
        var isDayEnd = tick.timestamp.getHours() === 14 && tick.timestamp.getMinutes() >= 58;
        var targetProfitReached = shares > 0 && tick.close >= averagePrice * phenotype.targetProfitPercentage;
        var stopLossReached = shares > 0 && tick.close <= averagePrice * phenotype.stopLossPercentage;
        var lastTickRedAndClosedOutsideBollingerBand = previousBollingerBandsValues && previousTick.close < previousTick.open && previousTick.close < previousBollingerBandsValues.lower;
        var currentTickGreenAndClosedInsideBollingerBand = tick.close > tick.open && tick.close > bollingerBandsValues.lower;

        if (shares === 0 && !isTooLateToTrade && lastTickRedAndClosedOutsideBollingerBand && currentTickGreenAndClosedInsideBollingerBand) {
            shares = Math.floor((dayTradingBuyingPower - commission) / tick.close);
            balance -= ((shares * tick.close) + commission);
            costBasis = (tick.close * Math.floor((dayTradingBuyingPower - commission) / tick.close)) + commission;
            averagePrice = tick.close;
            justBought = true;

            if (showTrades) {
                console.log('BOUGHT ' + shares + ' shares of ' + symbol + ' at ' +  tick.timestamp + ' for ' + ((shares * tick.close + commission)) + ' price ' + tick.close);
            }
        }

        if (!justBought && shares > 0 && (targetProfitReached || stopLossReached || isDayEnd)) {
            let grossProfit = (tick.close * shares) - commission;
            let netProfit = grossProfit - costBasis;

            if (showTrades) {
                console.log('SOLD ' + shares + ' shares of ' + symbol + ' at ' +  tick.timestamp + ' for gross ' + grossProfit.toFixed(2) + ' net ' + netProfit.toFixed(2) + ' price ' + tick.close);
                console.log();
            }

            balance = balance + (shares * tick.close - commission);
            shares = 0;
            costBasis = 0;
            averagePrice = 0;
            tradeCount++;

            if (balance < previousBalance) {
                loss += previousBalance - balance;
            }

            previousBalance = balance;
        }

        previousTick = tick;
        previousBollingerBandsValues = bollingerBandsValues;
    });

    if (showTrades) {
        console.log();
    }

    return {
        balance: balance,
        profit: balance - startingBalance,
        loss: loss,
        tradeCount: tradeCount
    };
}
