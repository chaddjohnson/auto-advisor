'use strict';

// Libraries
var colors = require('colors');
var _ = require('lodash');
var async = require('async');
var mongoose = require('mongoose');
var GeneticAlgorithm = require('geneticalgorithm');
var Tick = require('../../lib/models/tick');

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
var tickCount = 0;
var minVolume = 3000;
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
        tickCount = documents.length;
        taskCallback();
    });
});

// Create population.
tasks.push(function(taskCallback) {
    // Create an initial, randomized population.
    _.times(generateRandomNumber(1, 10), function(index) {
        population.push({
            recentChangeLength: generateRandomNumber(20, 50),
            recentRatioLength: generateRandomNumber(1, 10),
            minRecentChange: generateRandomNumber(1.0005, 1.0015, 5),
            maxRecentChange: generateRandomNumber(1.0015, 1.01, 5),
            minRecentRatio: generateRandomNumber(1.0001, 1.0008, 5),
            maxRecentRatio: generateRandomNumber(1.0006, 1.003, 5),
            minTicksSinceLastTrade: generateRandomNumber(1, 200),
            stopLossThreshold: generateRandomNumber(0.0001, 0.001, 5)
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
    var propertyMax = 7;
    var propertyIndex = Math.floor(Math.random() * ((propertyMax - propertyMin) + 1)) + propertyMin;

    // Use oldPhenotype and some random function to make a change to the phenotype.
    switch (propertyIndex) {
        case 0:
            resultPhenotype.recentChangeLength = generateRandomNumber(20, 50);
            break;

        case 1:
            resultPhenotype.recentRatioLength = generateRandomNumber(1, 10);
            break;

        case 2:
            resultPhenotype.minRecentChange = generateRandomNumber(1.0005, 1.0015, 5);
            break;

        case 3:
            resultPhenotype.maxRecentChange = generateRandomNumber(1.0015, 1.01, 5);
            break;

        case 4:
            resultPhenotype.minRecentRatio = generateRandomNumber(1.0001, 1.0008, 5);
            break;

        case 5:
            resultPhenotype.maxRecentRatio = generateRandomNumber(1.0006, 1.003, 5);
            break;

        case 6:
            resultPhenotype.minTicksSinceLastTrade = generateRandomNumber(1, 200);
            break;

        case 7:
            resultPhenotype.stopLossThreshold = generateRandomNumber(0.0001, 0.001, 5);
            break;
    }

    return resultPhenotype;
}

function crossoverFunction(phenotypeA, phenotypeB) {
    var result1 = _.clone(phenotypeA);
    var result2 = _.clone(phenotypeB);

    // Use phenotypeA and B to create phenotype result 1 and 2.

    if (generateRandomNumber(0, 1)) {
        result1.recentChangeLength = phenotypeB.recentChangeLength;
        result2.recentChangeLength = phenotypeA.recentChangeLength;
    }

    if (generateRandomNumber(0, 1)) {
        result1.recentRatioLength = phenotypeB.recentRatioLength;
        result2.recentRatioLength = phenotypeA.recentRatioLength;
    }

    if (generateRandomNumber(0, 1)) {
        result1.minRecentChange = phenotypeB.minRecentChange;
        result2.minRecentChange = phenotypeA.minRecentChange;
    }

    if (generateRandomNumber(0, 1)) {
        result1.maxRecentChange = phenotypeB.maxRecentChange;
        result2.maxRecentChange = phenotypeA.maxRecentChange;
    }

    if (generateRandomNumber(0, 1)) {
        result1.minRecentRatio = phenotypeB.minRecentRatio;
        result2.minRecentRatio = phenotypeA.minRecentRatio;
    }

    if (generateRandomNumber(0, 1)) {
        result1.maxRecentRatio = phenotypeB.maxRecentRatio;
        result2.maxRecentRatio = phenotypeA.maxRecentRatio;
    }

    if (generateRandomNumber(0, 1)) {
        result1.minTicksSinceLastTrade = phenotypeB.minTicksSinceLastTrade;
        result2.minTicksSinceLastTrade = phenotypeA.minTicksSinceLastTrade;
    }

    if (generateRandomNumber(0, 1)) {
        result1.stopLossThreshold = phenotypeB.stopLossThreshold;
        result2.stopLossThreshold = phenotypeA.stopLossThreshold;
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
    var previousCumulativeVolume = 0;
    var tradeCount = 0;
    var loss = 0;
    var shares = 0;
    var costBasis = 0;
    var boughtAt = null;
    var ticksSinceLastTrade = 0;
    var buying = false;
    var highestBidPrice = 0;
    var i = 0;

    ticks.forEach(function(tick, index) {
        if (index - 10 < Math.max(phenotype.recentChangeLength, phenotype.recentRatioLength)) {
            return;
        }

        if (shares > 0 && tick.bidPrice > highestBidPrice) {
            highestBidPrice = tick.bidPrice;
        }

        var volume = tick.cumulativeVolume - previousCumulativeVolume;
        var justBought = false;
        var isTooLateToTrade = tick.createdAt.getHours() === 14 && tick.createdAt.getMinutes() >= 56;
        var isDayEnd = tick.createdAt.getHours() === 14 && tick.createdAt.getMinutes() >= 58;
        var dayTradingBuyingPower = balance * 4;
        var stopLossReached = shares > 0 && tick.bidPrice <= highestBidPrice * (1 - phenotype.stopLossThreshold);
        var recentChangeMinBidPrice = 9999;

        for (i = index - (phenotype.recentChangeLength + 10); i <= index - 10 && i < tickCount; i++) {
            if (ticks[i].bidPrice < recentChangeMinBidPrice) {
                recentChangeMinBidPrice = ticks[i].bidPrice;
            }
        }

        var recentChange = tick.bidPrice / recentChangeMinBidPrice;
        var recentChangeSignal = recentChange >= phenotype.minRecentChange && recentChange <= phenotype.maxRecentChange;
        var recentRatio = tick.bidPrice / ticks[index - phenotype.recentRatioLength].bidPrice;
        var recentRatioSignal = recentRatio >= phenotype.minRecentRatio && recentChange <= phenotype.maxRecentRatio;
        var ticksSinceLastTradeEnough = ticksSinceLastTrade === 0 || ticksSinceLastTrade >= phenotype.minTicksSinceLastTrade;

        if (buying && volume >= minVolume) {
            shares = Math.floor((dayTradingBuyingPower - commission) / tick.askPrice);
            balance -= ((shares * tick.askPrice) + commission);
            costBasis = (tick.askPrice * Math.floor((dayTradingBuyingPower - commission) / tick.askPrice)) + commission;
            boughtAt = tick.createdAt;
            justBought = true;
            buying = false;
            highestBidPrice = tick.bidPrice;

            if (showTrades) {
                console.log('BOUGHT ' + shares + ' shares of ' + symbol + ' at ' +  tick.createdAt.toISOString() + ' for ' + ((shares * tick.askPrice + commission)) + ' price ' + tick.askPrice);
            }
        }

        if (shares === 0 && !isTooLateToTrade && recentChangeSignal && recentRatioSignal && ticksSinceLastTradeEnough) {
            buying = true;
        }

        if (!buying && !justBought && shares > 0 && (stopLossReached || isDayEnd) && volume >= minVolume && tick.createdAt.getTime() - boughtAt.getTime() >= 1000 * 3) {
            let grossProfit = (tick.bidPrice * shares) - commission;
            let netProfit = grossProfit - costBasis;

            if (showTrades) {
                console.log('SOLD ' + shares + ' shares of ' + symbol + ' at ' +  tick.createdAt.toISOString() + ' for gross ' + grossProfit.toFixed(2) + ' net ' + netProfit.toFixed(2) + ' price ' + tick.bidPrice);
                console.log();
            }

            balance = balance + (shares * tick.bidPrice - commission);
            shares = 0;
            costBasis = 0;
            tradeCount++;
            ticksSinceLastTrade = 0;
            highestBidPrice = 0;

            if (balance < previousBalance) {
                loss += previousBalance - balance;
            }

            previousBalance = balance;
        }

        previousCumulativeVolume = tick.cumulativeVolume;
        ticksSinceLastTrade++;
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
