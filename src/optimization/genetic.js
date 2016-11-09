'use strict';

// Get parameters.
var argv = require('yargs').argv;
var symbol = argv.symbol;
var filePath = argv.file;
var populationSize = parseInt(argv.populationSize);
var evolutionCount = parseInt(argv.evolutionCount);

// Check parameters.
if (!symbol) {
    console.log('Symbol must be specified.');
    process.exit(1);
}
if (!filePath) {
    console.error('No input file provided.');
    process.exit(1);
}
if (!populationSize) {
    console.error('No population size provided.');
    process.exit(1);
}
if (!evolutionCount) {
    console.error('No evolution count provided.');
    process.exit(1);
}

// Libraries
var _ = require('lodash');
var GeneticAlgorithm = require('geneticalgorithm');

// Data
var data = require(filePath);

// Population for the algorithm.
var population = [];

// Create an initial, randomized population.
_.times(generateRandomNumber(1, 10), function(index) {
    population.push({
        investmentDivisor: generateRandomNumber(3.0, 20.0, 5),
        sellTriggerProfitPercentage: generateRandomNumber(0.05, 2.0, 5),
        stopLossThreshold: generateRandomNumber(0.05, 10.0, 5),
        recentLargeChangeCounterStart: generateRandomNumber(1, 10),
        minPercentChangeBuy: generateRandomNumber(-10, 0, 5),
        maxPercentChangeBuy: generateRandomNumber(0, 10, 5)
    });
});

// Initialize the machine learning algorithm.
var geneticAlgorithm = GeneticAlgorithm({
    mutationFunction: mutationFunction,
    crossoverFunction: crossoverFunction,
    fitnessFunction: fitnessFunction,
    // doesABeatBFunction: competitionFunction,
    population: population,
    populationSize: populationSize
});

console.log('Optimizing for ' + symbol);

// Run the algorithm.
_.times(evolutionCount, function(index) {
    process.stdout.cursorTo(0);
    process.stdout.write('Evolution ' + (index + 1) + ' of ' + evolutionCount + '...');

    geneticAlgorithm.evolve();
});

var bestPhenotype = geneticAlgorithm.best();

// Show the results.
process.stdout.write('\n');
console.log(JSON.stringify(bestPhenotype));
console.log(JSON.stringify(backtest(bestPhenotype)));
process.stdout.write('\n');


function mutationFunction(oldPhenotype) {
    var resultPhenotype = _.clone(oldPhenotype);

    // Select a random property to mutate.
    var propertyMin = 0;
    var propertyMax = 5;
    var propertyIndex = Math.floor(Math.random() * ((propertyMax - propertyMin) + 1)) + propertyMin;

    // Use oldPhenotype and some random function to make a change to the phenotype.
    switch (propertyIndex) {
        case 0:
            resultPhenotype.investmentDivisor = generateRandomNumber(3.0, 20.0, 5);
            break;

        case 1:
            resultPhenotype.sellTriggerProfitPercentage = generateRandomNumber(0.05, 2.0, 5);
            break;

        case 2:
            resultPhenotype.stopLossThreshold = generateRandomNumber(0.05, 10.0, 5);
            break;

        case 3:
            resultPhenotype.recentLargeChangeCounterStart = generateRandomNumber(1, 10);
            break;

        case 4:
            resultPhenotype.minPercentChangeBuy = generateRandomNumber(-10, 0, 5);
            break;

        case 5:
            resultPhenotype.maxPercentChangeBuy = generateRandomNumber(0, 10, 5);
            break;
    }

    return resultPhenotype;
}

function crossoverFunction(phenotypeA, phenotypeB) {
    var result1 = _.clone(phenotypeA);
    var result2 = _.clone(phenotypeB);

    // Use phenotypeA and B to create phenotype result 1 and 2.

    if (generateRandomNumber(0, 1)) {
        result1.investmentDivisor = phenotypeB.investmentDivisor;
        result2.investmentDivisor = phenotypeA.investmentDivisor;
    }

    if (generateRandomNumber(0, 1)) {
        result1.sellTriggerProfitPercentage = phenotypeB.sellTriggerProfitPercentage;
        result2.sellTriggerProfitPercentage = phenotypeA.sellTriggerProfitPercentage;
    }

    if (generateRandomNumber(0, 1)) {
        result1.stopLossThreshold = phenotypeB.stopLossThreshold;
        result2.stopLossThreshold = phenotypeA.stopLossThreshold;
    }

    if (generateRandomNumber(0, 1)) {
        result1.recentLargeChangeCounterStart = phenotypeB.recentLargeChangeCounterStart;
        result2.recentLargeChangeCounterStart = phenotypeA.recentLargeChangeCounterStart;
    }

    if (generateRandomNumber(0, 1)) {
        result1.minPercentChangeBuy = phenotypeB.minPercentChangeBuy;
        result2.minPercentChangeBuy = phenotypeA.minPercentChangeBuy;
    }

    if (generateRandomNumber(0, 1)) {
        result1.maxPercentChangeBuy = phenotypeB.maxPercentChangeBuy;
        result2.maxPercentChangeBuy = phenotypeA.maxPercentChangeBuy;
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

function backtest(phenotype) {
    // AMZN
    // var pullOutDates = ['2016-10-27','2016-07-28','2016-04-28','2016-01-28','2015-10-22','2015-07-23','2015-04-23','2015-01-29','2014-10-23','2014-07-24'];

    // NVDA
    var pullOutDates = ['11/10/2016','08/11/2016','05/12/2016','02/17/2016','11/05/2015','08/06/2015'];

    var balance = 100000;
    var startingBalance = balance;
    var loss = 0;
    var commission = 4.95;
    var baseInvestment = startingBalance / phenotype.investmentDivisor;
    var positions = [];
    var previousPrice = 0;
    var previousDate = 0;
    var recentLargeChangeCounter = 0;
    var accountValue = 0;
    var firstBuyDate = 0;
    var totalDaysHeld = 0;
    var sellCount = 0;

    data.forEach(function(dataPoint) {
        if (!previousPrice) {
            previousPrice = dataPoint.close;
            previousDate = dataPoint.date;
            return;
        }

        var costBasisSum = 0;
        var shareSum = 0;

        positions.forEach(function(position) {
            costBasisSum += position.costBasis;
            shareSum += position.shares;
        });

        var percentChange = ((dataPoint.close / previousPrice) - 1) * 100;
        var averagePositionCostBasis = costBasisSum / shareSum;
        var targetSellPrice = averagePositionCostBasis * (1 + (phenotype.sellTriggerProfitPercentage / 100));
        var targetSellPriceReached = dataPoint.close >= targetSellPrice;
        var stopLossThresholdReached = dataPoint.close <= averagePositionCostBasis * (1 - (phenotype.stopLossThreshold / 100));
        var isPullOutDate = pullOutDates.indexOf(dataPoint.date) > -1;

        if (positions.length && (stopLossThresholdReached || targetSellPriceReached || isPullOutDate)) {
            let grossProfit = (shareSum * dataPoint.close) - commission;
            let netProfit = grossProfit - costBasisSum;

            balance += grossProfit;
            positions = [];
            baseInvestment = balance / phenotype.investmentDivisor;
            shareSum = 0;
            totalDaysHeld += Math.round((new Date(dataPoint.date) - new Date(firstBuyDate)) / 24 / 60 / 60 / 1000);
            firstBuyDate = 0;
            sellCount++;

            if (netProfit < 0) {
                loss += netProfit * -1;
            }
        }

        if (percentChange > phenotype.minPercentChangeBuy && percentChange < phenotype.maxPercentChangeBuy && !isPullOutDate) {
            if (recentLargeChangeCounter <= 0) {
                let position = {};
                let investment = Math.sqrt(Math.abs(percentChange)) * baseInvestment;

                position.shares = Math.floor(investment / dataPoint.close);
                position.pricePerShare = dataPoint.close;
                position.costBasis = (position.shares * position.pricePerShare) + commission;

                // Ensure adding the position will not exceed the balance.
                if (balance - position.costBasis > 0 && position.shares > 0) {
                    positions.push(position);
                    balance -= position.costBasis;
                    shareSum += position.shares;

                    if (!firstBuyDate) {
                        firstBuyDate = dataPoint.date;
                    }
                }
            }
        }
        else {
            if (!isPullOutDate) {
                recentLargeChangeCounter = phenotype.recentLargeChangeCounterStart;
            }
        }

        // Calculate current account value.
        accountValue = balance + (shareSum * dataPoint.close);

        previousPrice = dataPoint.close;
        previousDate = dataPoint.date;
        recentLargeChangeCounter--;
    });

    return {
        profit: accountValue - startingBalance,
        loss: loss,
        sellCount: sellCount,
        averageDaysHeld: totalDaysHeld / sellCount
    };
}

function generateRandomNumber(min, max, decimals) {
    decimals = decimals || 0;

    return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}
