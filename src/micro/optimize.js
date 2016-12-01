'use strict';

// Libraries
var colors = require('colors');
var _ = require('lodash');
var moment = require('moment');
var async = require('async');
var mongoose = require('mongoose');
var GeneticAlgorithm = require('geneticalgorithm');
var EmaIndicator = require('../../lib/indicators/ema');
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
            $lte: new Date('2016-11-29T23:59:59.000Z'),
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

// Create population.
tasks.push(function(taskCallback) {
    // Create an initial, randomized population.
    _.times(generateRandomNumber(1, 10), function(index) {
        population.push({
            emaLength: generateRandomNumber(1, 30),
            emaChangeNegativeBuyThreshold: generateRandomNumber(1, 50),
            emaChangePositiveBuyThreshold: generateRandomNumber(1, 10),
            emaChangeNegativeSellThreshold: generateRandomNumber(1, 10),
            targetIncrease: generateRandomNumber(0.0000625, 0.001, 7),
            stopLossThreshold: generateRandomNumber(0.2, 0.5, 5)
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
    var propertyMax = 5;
    var propertyIndex = Math.floor(Math.random() * ((propertyMax - propertyMin) + 1)) + propertyMin;

    // Use oldPhenotype and some random function to make a change to the phenotype.
    switch (propertyIndex) {
        case 0:
            resultPhenotype.emaLength = generateRandomNumber(1, 30);
            break;

        case 1:
            resultPhenotype.emaChangeNegativeBuyThreshold = generateRandomNumber(1, 50);
            break;

        case 2:
            resultPhenotype.emaChangePositiveBuyThreshold = generateRandomNumber(1, 10);
            break;

        case 3:
            resultPhenotype.emaChangeNegativeSellThreshold = generateRandomNumber(1, 10);
            break;

        case 4:
            resultPhenotype.targetIncrease = generateRandomNumber(0.0000625, 0.001, 7);
            break;

        case 5:
            resultPhenotype.stopLossThreshold = generateRandomNumber(0.2, 0.5, 5);
            break;
    }

    return resultPhenotype;
}

function crossoverFunction(phenotypeA, phenotypeB) {
    var result1 = _.clone(phenotypeA);
    var result2 = _.clone(phenotypeB);

    // Use phenotypeA and B to create phenotype result 1 and 2.

    if (generateRandomNumber(0, 1)) {
        result1.emaLength = phenotypeB.emaLength;
        result2.emaLength = phenotypeA.emaLength;
    }

    if (generateRandomNumber(0, 1)) {
        result1.emaChangeNegativeBuyThreshold = phenotypeB.emaChangeNegativeBuyThreshold;
        result2.emaChangeNegativeBuyThreshold = phenotypeA.emaChangeNegativeBuyThreshold;
    }

    if (generateRandomNumber(1, 1)) {
        result1.emaChangePositiveBuyThreshold = phenotypeB.emaChangePositiveBuyThreshold;
        result2.emaChangePositiveBuyThreshold = phenotypeA.emaChangePositiveBuyThreshold;
    }

    if (generateRandomNumber(1, 1)) {
        result1.emaChangeNegativeSellThreshold = phenotypeB.emaChangeNegativeSellThreshold;
        result2.emaChangeNegativeSellThreshold = phenotypeA.emaChangeNegativeSellThreshold;
    }

    if (generateRandomNumber(1, 1)) {
        result1.targetIncrease = phenotypeB.targetIncrease;
        result2.targetIncrease = phenotypeA.targetIncrease;
    }

    if (generateRandomNumber(1, 1)) {
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

    var accountValue = 0;
    var commission = 4.95;
    var balance = investment;
    var startingBalance = balance;
    var previousBalance = balance;
    var tradeCount = 0;
    var loss = 0;
    var cumulativeTicks = [];
    var previousEma = 0;
    var emaChange = 0;
    var emaChangeNegativeCount = 0;
    var emaChangePositiveCount = 0;
    var recentEmaChangeNegativeCount = 0;
    var shares = 0;
    var targetSellPrice = 0;
    var averagePrice = 0;

    // Set up indicators.
    var emaIndicator = new EmaIndicator({length: phenotype.emaLength}, {ema: 'ema'});
    var emaIndicatorValues = null;

    ticks.forEach(function(tick) {
        var justBought = false;
        var isTooLateToTrade = new Date(tick.createdAt).getHours() === 14 && new Date(tick.createdAt).getMinutes() >= 56;
        var isDayEnd = new Date(tick.createdAt).getHours() === 14 && new Date(tick.createdAt).getMinutes() >= 58;
        var dayTradingBuyingPower = balance * 4;
        var stopLossReached = false;

        cumulativeTicks.push(tick);

        emaIndicator.setData(cumulativeTicks);
        emaIndicatorValues = emaIndicator.tick();

        if (!previousEma) {
            previousEma = emaIndicatorValues.ema;
            return;
        }

        stopLossReached = shares > 0 && emaIndicatorValues.ema <= averagePrice * (1 - (phenotype.stopLossThreshold / 100));

        emaChange = emaIndicatorValues.ema - previousEma;

        if (emaChange < 0) {
            emaChangeNegativeCount++;
            emaChangePositiveCount = 0;
        }
        else {
            recentEmaChangeNegativeCount = emaChangeNegativeCount;
            emaChangeNegativeCount = 0;
            emaChangePositiveCount++;
        }

        // Buy if no position and >= n EMA change negatives followed by m change positives.
        if (shares === 0 && !isTooLateToTrade && recentEmaChangeNegativeCount >= phenotype.emaChangeNegativeBuyThreshold && emaChangePositiveCount >= phenotype.emaChangePositiveBuyThreshold) {
            shares = Math.floor((dayTradingBuyingPower - commission) / tick.askPrice);
            balance -= ((shares * tick.askPrice) + commission);
            targetSellPrice = tick.askPrice * (1 + phenotype.targetIncrease);
            averagePrice = tick.askPrice;
            justBought = true;

            if (showTrades) {
                console.log('BOUGHT ' + shares + ' shares of ' + symbol + ' at ' +  moment(tick.createdAt).format('YYYY-MM-DD HH:mm:ss') + ' for ' + ((shares * tick.askPrice + commission)) + ' price ' + tick.askPrice + ' target ' + targetSellPrice);
            }
        }

        if (!justBought && shares > 0 && ((targetSellPrice && tick.bidPrice >= targetSellPrice) || stopLossReached || isDayEnd)) {
            if (showTrades) {
                console.log('SOLD ' + shares + ' shares of ' + symbol + ' at ' +  moment(tick.createdAt).format('YYYY-MM-DD HH:mm:ss') + ' for ' + ((shares * tick.bidPrice - commission)) + ' price ' + tick.bidPrice);
                console.log();
            }

            balance = balance + (shares * tick.bidPrice - commission);
            shares = 0;
            targetSellPrice = 0;
            averagePrice = 0;
            tradeCount++;

            if (balance < previousBalance) {
                loss += previousBalance - balance;
            }

            previousBalance = balance;
        }

        previousEma = emaIndicatorValues.ema;
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
