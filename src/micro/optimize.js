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

// Config
var config = require('../../config.json');

// Get parameters.
var argv = require('yargs').argv;
var symbol = argv.symbol;
var populationSize = parseInt(argv.populationSize);
var evolutionCount = parseInt(argv.evolutionCount);
var investment = parseFloat(argv.investment);
var date = argv.date;

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
if (!date) {
    console.error(colors.red('No date provided.'));
    process.exit(1);
}

// Set up the trading client.
var tradingClient = require('../../lib/tradingClients/base').factory('tradeking', config.brokerage);

// State
var population = [];
var ticks = [];
var bestPhenotype = null;

// Synchronous tasks
var tasks = [];

mongoose.connect('mongodb://localhost/trading');
mongoose.connection.on('error', function(error) {
    console.error(colors.red('Database connection error: ' + error));
});

// Load data.
tasks.push(function(taskCallback) {
    var constraints = {
        symbol: symbol,
        createdAt: {
            $gte: new Date(date + 'T00:00:00.000Z'),
            $lte: new Date(date + 'T23:59:59.000Z')
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
            consecutiveNegatives: generateRandomNumber(1, 50),
            consecutivePositives: generateRandomNumber(1, 15),
            emaLength: generateRandomNumber(1, 30),
            emaChangeNegativeBuyThreshold: generateRandomNumber(1, 50),
            emaChangePositiveBuyThreshold: generateRandomNumber(1, 10),
            emaChangeNegativeSellThreshold: generateRandomNumber(1, 10),
            targetIncrease: generateRandomNumber(0.0000625, 0.001, 7)
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
    console.log(colors.green(JSON.stringify(bestPhenotype)));
    console.log(colors.blue(JSON.stringify(backtest(bestPhenotype, true))));
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
    var propertyMax = 6;
    var propertyIndex = Math.floor(Math.random() * ((propertyMax - propertyMin) + 1)) + propertyMin;

    // Use oldPhenotype and some random function to make a change to the phenotype.
    switch (propertyIndex) {
        case 0:
            resultPhenotype.consecutiveNegatives = generateRandomNumber(1, 50);
            break;

        case 1:
            resultPhenotype.consecutivePositives = generateRandomNumber(1, 15);
            break;

        case 2:
            resultPhenotype.emaLength = generateRandomNumber(1, 30);
            break;

        case 3:
            resultPhenotype.emaChangeNegativeBuyThreshold = generateRandomNumber(1, 50);
            break;

        case 4:
            resultPhenotype.emaChangePositiveBuyThreshold = generateRandomNumber(1, 10);
            break;

        case 5:
            resultPhenotype.emaChangeNegativeSellThreshold = generateRandomNumber(1, 10);
            break;

        case 6:
            resultPhenotype.targetIncrease = generateRandomNumber(0.0000625, 0.001, 7);
    }

    return resultPhenotype;
}

function crossoverFunction(phenotypeA, phenotypeB) {
    var result1 = _.clone(phenotypeA);
    var result2 = _.clone(phenotypeB);

    // Use phenotypeA and B to create phenotype result 1 and 2.

    if (generateRandomNumber(0, 1)) {
        result1.consecutiveNegatives = phenotypeB.consecutiveNegatives;
        result2.consecutiveNegatives = phenotypeA.consecutiveNegatives;
    }

    if (generateRandomNumber(0, 1)) {
        result1.consecutivePositives = phenotypeB.consecutivePositives;
        result2.consecutivePositives = phenotypeA.consecutivePositives;
    }

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

    return [result1, result2];
}

function fitnessFunction(phenotype) {
    var fitness = backtest(phenotype).profit;

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
    var balance = 200000;
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

    // Set up indicators.
    var emaIndicator = new EmaIndicator({length: phenotype.emaLength}, {ema: 'ema'});
    var emaIndicatorValues = null;

    ticks.forEach(function(tick) {
        var justBought = false;

        cumulativeTicks.push(tick);

        emaIndicator.setData(cumulativeTicks);
        emaIndicatorValues = emaIndicator.tick();

        if (!previousEma) {
            previousEma = emaIndicatorValues.ema;
            return;
        }

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
        if (shares === 0 && recentEmaChangeNegativeCount >= phenotype.emaChangeNegativeBuyThreshold && emaChangePositiveCount >= phenotype.emaChangePositiveBuyThreshold) {
            shares = Math.floor(balance / tick.askPrice);
            balance = balance - (shares * tick.askPrice + commission);
            targetSellPrice = tick.askPrice * (1 + phenotype.targetIncrease);
            justBought = true;

            if (showTrades) {
                console.log('BOUGHT ' + shares + ' shares at ' +  moment(tick.createdAt).format('YYYY-MM-DD HH:mm:ss') + ' for ' + ((shares * tick.askPrice + commission)) + ' price ' + tick.askPrice + ' target ' + targetSellPrice);
            }
        }

        if (!justBought && shares > 0 && (tick.bidPrice >= targetSellPrice || emaChangeNegativeCount >= phenotype.emaChangeNegativeSellThreshold)) {
            if (showTrades) {
                console.log('SOLD ' + shares + ' shares at ' +  moment(tick.createdAt).format('YYYY-MM-DD HH:mm:ss') + ' for ' + ((shares * tick.bidPrice - commission)) + ' price ' + tick.bidPrice);
            }

            balance = balance + (shares * tick.bidPrice - commission);
            shares = 0;
            targetSellPrice = 0;
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
