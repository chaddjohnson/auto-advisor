'use strict';

// Get parameters.
var argv = require('yargs').argv;
var symbol = argv.symbol;
var filePath1 = argv.file1;
var filePath2 = argv.file2;
var populationSize = parseInt(argv.populationSize);
var evolutionCount = parseInt(argv.evolutionCount);

// Check parameters.
if (!symbol) {
    console.log('Symbol must be specified.');
    process.exit(1);
}
if (!filePath1) {
    console.error('No input file 1 provided.');
    process.exit(1);
}
if (!filePath2) {
    console.error('No input file 2 provided.');
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
var data1 = require(filePath1);
var data2 = require(filePath2);

// Population for the algorithm.
var population = [];

console.log('Optimizing for ' + symbol);

// Create an initial, randomized population.
_.times(generateRandomNumber(1, 10), function(index) {
    population.push({
        investmentDivisor: generateRandomNumber(3.0, 20.0, 5),
        sellTriggerProfitPercentage: generateRandomNumber(0.05, 2.0, 5),
        stopLossThreshold: generateRandomNumber(0.05, 10.0, 5)
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
console.log(JSON.stringify(backtest(bestPhenotype, data1)));
console.log(JSON.stringify(backtest(bestPhenotype, data2)));
process.stdout.write('\n');


function mutationFunction(oldPhenotype) {
    var resultPhenotype = _.clone(oldPhenotype);

    // Select a random property to mutate.
    var propertyMin = 0;
    var propertyMax = 2;
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

    return [result1, result2];
}

function fitnessFunction(phenotype) {
    var fitness = backtest(phenotype, data1).profit;

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

function backtest(phenotype, data) {
    var pullOutDates = ['2017-02-02','2016-10-27','2016-07-28','2016-04-28','2016-01-28','2015-10-22','2015-07-23','2015-04-23','2015-01-29','2014-10-23','2014-07-24','2014-04-24','2014-01-30','2013-10-24','2013-07-25','2013-04-25','2013-01-29','2012-10-25','2012-07-26','2012-04-26','2012-01-31'];
    var balance = 100000;
    var startingBalance = balance;
    var loss = 0;
    var commission = 4.95;
    var baseInvestment = startingBalance / phenotype.investmentDivisor;
    var previousPrice = 0;
    var previousDate = 0;
    var accountValue = 0;
    var firstBuyDate = 0;
    var totalDaysHeld = 0;
    var sellCount = 0;
    var costBasisSum = 0;
    var shareSum = 0;
    var averageCostBasis = 0;

    data.forEach(function(dataPoint) {
        if (!previousPrice) {
            previousPrice = dataPoint.close;
            previousDate = dataPoint.date;
            return;
        }

        var percentChange = ((dataPoint.close / previousPrice) - 1) * 100;
        var targetSellPrice = averageCostBasis * (1 + (phenotype.sellTriggerProfitPercentage / 100));
        var targetSellPriceReached = dataPoint.close >= targetSellPrice;
        var stopLossThresholdReached = dataPoint.close <= averageCostBasis * (1 - (phenotype.stopLossThreshold / 100));
        var isPullOutDate = pullOutDates.indexOf(dataPoint.date) > -1;

        if (shareSum > 0 && (stopLossThresholdReached || targetSellPriceReached || isPullOutDate)) {
            let grossProfit = (shareSum * dataPoint.close) - commission;
            let netProfit = grossProfit - costBasisSum;

            balance += grossProfit;
            baseInvestment = balance / phenotype.investmentDivisor;
            costBasisSum = 0;
            shareSum = 0;
            averageCostBasis = 0;
            totalDaysHeld += Math.round((new Date(dataPoint.date) - new Date(firstBuyDate)) / 24 / 60 / 60 / 1000);
            firstBuyDate = 0;
            sellCount++;

            if (netProfit < 0) {
                loss += netProfit * -1;
            }
        }

        if (!isPullOutDate) {
            let position = {};
            let investment = Math.sqrt(Math.abs(percentChange)) * baseInvestment;

            position.shares = Math.floor(investment / dataPoint.close);
            position.pricePerShare = dataPoint.close;
            position.costBasis = (position.shares * position.pricePerShare) + commission;

            // Ensure adding the position will not exceed the balance.
            if (balance - position.costBasis > 0 && position.shares > 0) {
                balance -= position.costBasis;
                costBasisSum += position.costBasis;
                shareSum += position.shares;
                averageCostBasis = costBasisSum / shareSum;

                if (!firstBuyDate) {
                    firstBuyDate = dataPoint.date;
                }
            }
        }

        // Calculate current account value.
        accountValue = balance + (shareSum * dataPoint.close);

        previousPrice = dataPoint.close;
        previousDate = dataPoint.date;
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
