'use strict';

if (process.argv.length < 3) {
    console.log('Symbol must be specified.');
    process.exit(1);
}

var express = require('express');
var bodyParser = require('body-parser');
var app = express();

var symbol = process.argv[2];
var quotes = require('../../data/' + symbol);
var quoteIndex = -1;
var previousQuote = null;
var cashAvailable = 100000;
var commission = 0;  // 4.95;
var holdings = [];

app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());

app.get('/quotes/previous', function(request, response) {
    response.status(200).end(JSON.stringify(previousQuote));
});

app.get('/quotes/current', function(request, response) {
    var currentQuote = quotes[++quoteIndex];

    // Send the current quote.
    if (currentQuote) {
        response.status(200).end(JSON.stringify(currentQuote));

        // Update the previous quote to be the current one.
        previousQuote = currentQuote;
    }
    else {
        response.status(404).end();
    }
});

app.get('/account/balance', function(request, response) {
    response.status(200).end(JSON.stringify({
        cashavailable: cashAvailable
    }));
});

app.get('/account/holdings', function(request, response) {
    response.status(200).end(JSON.stringify(holdings));
});

app.post('/account/orders', function(request, response) {
    var currentQuote = quotes[quoteIndex];
    var type = request.body.type;

    if (type === 'BUY') {
        let holding = {};

        holding.shares = request.body.shares;
        holding.pricePerShare = currentQuote.close;
        holding.costBasis = holding.shares * holding.pricePerShare;

        // Ensure there is enough available cash before adding the holding.
        if ((holding.costBasis + commission) <= cashAvailable) {
            // Add the holding to the list of holdings.
            holdings.push(holding);

            cashAvailable -= holding.costBasis;
            cashAvailable -= commission;

            console.log('Bought ' + holding.shares + ' shares of ' + symbol + ' on ' + currentQuote.date + ' for $' + holding.pricePerShare.toFixed(4) + ' totaling $' + holding.costBasis.toFixed(2) + ', available cash $' + cashAvailable.toFixed(2));
            response.status(201).end(JSON.stringify(holding));
        }
        else {
            console.log('Insufficient cash.');
            response.status(400).end(JSON.stringify({error: 'Insufficient cash.'}));
        }
    }
    else if (type === 'SELL') {
        let soldShares = 0;
        let earnings = 0;

        // Sell all positions.
        holdings.forEach(function(holding) {
            cashAvailable += holding.shares * currentQuote.close;
            earnings += holding.shares * currentQuote.close;
            soldShares += holding.shares;
        });
        cashAvailable -= commission;
        earnings -= commission;
        holdings = [];

        console.log('Sold ' + soldShares + ' of ' + symbol + ' on ' + currentQuote.date + ' for $ ' + currentQuote.close.toFixed(4) + ' totaling $' + earnings.toFixed(2) +', available cash ' + cashAvailable.toFixed(2));
        response.status(201).end(JSON.stringify(holdings));
    }
    else {
        response.status(400).end(JSON.stringify({error: 'Invalid type.'}));
    }
});

app.listen(5000, function() {
    console.log('Trade service listening on port 5000');
});
