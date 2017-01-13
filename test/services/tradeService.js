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
var cash = 100000;
var margin = cash;
var marginUsed = 0;
var dateMarginUsed = 0;
var commission = 4.95;
var holding = {
    qty: 0,
    costbasis: 0
};
var transactions = [];

app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());

app.get('/quotes/:symbol', function(request, response) {
    var currentQuote = quotes[++quoteIndex];

    if (currentQuote) {
        response.status(200).end(JSON.stringify({
            response: {
                quotes: {
                    quote: {
                        datetime: currentQuote.date + 'T' + '19:25:00Z',
                        bid: currentQuote.close.toString(),
                        ask: currentQuote.close.toString(),
                        last: currentQuote.close.toString(),
                        adv_90: '12345678',
                        pcls: previousQuote ? previousQuote.close.toString() : currentQuote.close.toString()
                    }
                },
                error: 'Success'
            }
        }));

        // Update the previous quote to be the current one.
        previousQuote = currentQuote;
    }
    else {
        response.status(404).end();
    }
});

app.get('/accounts/:id', function(request, response) {
    var currentQuote = quotes[quoteIndex];

    response.status(200).end(JSON.stringify({
        response: {
            accountbalance: {
                buyingpower: {
                    stock: (cash + margin).toString()
                },
                money: {
                    cash: cash.toString(),
                    marginbalance: margin.toString(),
                }
            },
            accountholdings: {
                holding: {
                    costbasis: holding.costbasis.toString(),
                    qty: holding.qty.toString(),
                    marketvalue: (holding.qty * currentQuote.close).toString()
                }
            },
            instrument: {
                sym: symbol
            },
            error: 'Success'
        }
    }));
});

app.get('/accounts/:id/holdings', function(request, response) {
    var currentQuote = quotes[quoteIndex];

    response.status(200).end(JSON.stringify({
        response: {
            accountholdings: {
                holding: {
                    costbasis: holding.costbasis.toString(),
                    qty: holding.qty.toString(),
                    marketvalue: (holding.qty * currentQuote.close).toString(),
                    purchaseprice: 0,
                    gainloss: 0,
                    instrument: {
                        sym: symbol
                    },
                }
            },
            error: 'Success'
        }
    }));
});

app.get('/accounts/:id/history', function(request, response) {
    response.status(200).end(JSON.stringify({
        response: {
            transactions: {
                transaction: transactions
            }
        }
    }));
});

app.post('/accounts/:id/orders', function(request, response) {
    var currentQuote = quotes[quoteIndex];
    var type = request.body.type;

    if (type === 'BUY') {
        let newHolding = {};

        newHolding.qty = request.body.qty;
        newHolding.costbasis = (newHolding.qty * currentQuote.close) + commission;

        // Ensure there is enough available cash before adding the holding.
        if ((newHolding.costbasis + commission) <= cash + margin) {
            // Add the new holding to the current holding.
            holding.qty += newHolding.qty;
            holding.costbasis += newHolding.costbasis;

            if (cash - newHolding.costbasis > 0) {
                // Subtract new holding amount from cash.
                cash -= newHolding.costbasis;
            }
            else {
                if (cash > 0 && cash + margin >= newHolding.costbasis) {
                    margin -= newHolding.costbasis - cash;
                    marginUsed += newHolding.costbasis - cash;
                    cash = 0;

                    if (!dateMarginUsed) {
                        dateMarginUsed = currentQuote.date;
                    }
                }
                else if (margin > newHolding.costbasis) {
                    margin -= newHolding.costbasis;
                    marginUsed += newHolding.costbasis;

                    if (!dateMarginUsed) {
                        dateMarginUsed = currentQuote.date;
                    }
                }
                else {
                    return response.status(400).end(JSON.stringify({
                        response: {
                            error: 'Insufficient cash for ' + newHolding.costbasis + '. cash = ' + cash + ', margin = ' + margin
                        }
                    }));
                }
            }

            // Add to the transaction history.
            transactions.unshift({
                activity: 'Trade',
                date: currentQuote.date + 'T00:00:00-04:00',
                amount: newHolding.costbasis,
                symbol: symbol,
                transaction: {
                    commission: commission,
                    price: currentQuote.close,
                    quantity: newHolding.qty,
                    side: '1'
                }
            });

            console.log('Bought ' + newHolding.qty + ' shares of ' + symbol + ' on ' + currentQuote.date + ' for $' + currentQuote.close.toFixed(4) + ' totaling $' + newHolding.costbasis.toFixed(2) + ', available cash $' + (cash + margin).toFixed(2));

            // Send the response.
            response.status(201).end(JSON.stringify({
                response: {
                    error: 'Success'
                }
            }));
        }
        else {
            console.log('Insufficient cash for ' + newHolding.costbasis + '. cash = ' + cash + ', margin = ' + margin);

            // Send the response.
            response.status(400).end(JSON.stringify({
                response: {
                    error: 'Insufficient cash for ' + newHolding.costbasis + '. cash = ' + cash + ', margin = ' + margin
                }
            }));
        }
    }
    else if (type === 'SELL') {
        let soldQty = 0;
        let earnings = 0;
        let marginDays = 0;
        let marginInterest = 0;

        // Calculate earnings and sold shares from selling entire holding.
        marginDays = Math.round((new Date(currentQuote.date) - new Date(dateMarginUsed)) / 24 / 60 / 60 / 1000);
        marginInterest = ((marginUsed * getMarginInterestRate(marginUsed)) / 365) * marginDays;
        earnings = (((holding.qty * currentQuote.close) - commission) - marginUsed) - marginInterest;
        soldQty = holding.qty;

        // Add earnings to cash.
        cash += earnings;
        margin = cash + 0;
        console.log(marginUsed);
        marginUsed = 0;
        dateMarginUsed = 0;

        // Add to the transaction history.
        transactions.unshift({
            activity: 'Trade',
            date: currentQuote.date + 'T00:00:00-04:00',
            amount: holding.costbasis,
            symbol: symbol,
            transaction: {
                commission: commission,
                price: currentQuote.close,
                quantity: holding.qty,
                side: '2'
            }
        });

        // Reset the holding.
        holding.qty = 0;
        holding.costbasis = 0;

        console.log('Sold ' + soldQty + ' of ' + symbol + ' on ' + currentQuote.date + ' for $ ' + currentQuote.close.toFixed(4) + ' totaling $' + earnings.toFixed(2) +', available cash ' + cash.toFixed(2) + ', stock buying power ' + (cash + margin).toFixed(2));

        // Send the response.
        response.status(201).end(JSON.stringify({
            response: {
                error: 'Success'
            }
        }));
    }
    else {
        response.status(400).end(JSON.stringify({
            response: {
                error: 'Invalid order type.'}
            }
        ));
    }
});

app.listen(5000, function() {
    console.log('Trade service listening on port 5000');
});

function getMarginInterestRate(amount) {
    if (amount < 5000) {
        return 9 / 100;
    }
    else if (amount >= 5000 && amount < 50000) {
        return 8 / 100;
    }
    else if (amount >= 50000 && amount < 100000) {
        return 7 / 100;
    }
    else if (amount >= 100000 && amount < 250000) {
        return 5.75 / 100;
    }
    else if (amount >= 250000 && amount < 500000) {
        return 4.75 / 100;
    }
    else {
        return 4.25 / 100;
    }
}
