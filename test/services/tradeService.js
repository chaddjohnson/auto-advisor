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
                        last: currentQuote.close.toString(),
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
    response.status(200).end(JSON.stringify({
        response: {
            accountbalance: {
                money: {
                    cash: cash.toString()
                }
            },
            accountholdings: {
                holding: {
                    costbasis: holding.costbasis.toString(),
                    qty: holding.qty.toString()
                }
            },
            instrument: {
                sym: symbol
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
        if ((newHolding.costbasis + commission) <= cash) {
            // Add the new holding to the current holding.
            holding.qty += newHolding.qty;
            holding.costbasis += newHolding.costbasis;

            // Subtract new holding amount from cash.
            cash -= newHolding.costbasis;

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

            console.log('Bought ' + newHolding.qty + ' shares of ' + symbol + ' on ' + currentQuote.date + ' for $' + currentQuote.close.toFixed(4) + ' totaling $' + newHolding.costbasis.toFixed(2) + ', available cash $' + cash.toFixed(2));

            // Send the response.
            response.status(201).end(JSON.stringify({
                response: {
                    error: 'Success'
                }
            }));
        }
        else {
            console.log('Insufficient cash.');

            // Send the response.
            response.status(400).end(JSON.stringify({
                response: {
                    error: 'Insufficient cash.'}
                }
            ));
        }
    }
    else if (type === 'SELL') {
        let soldQty = 0;
        let earnings = 0;

        // Calculate earnings and sold shares from selling entire holding.
        earnings = (holding.qty * currentQuote.close) - commission;
        soldQty = holding.qty;

        // Add earnings to cash.
        cash += earnings;

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

        console.log('Sold ' + soldQty + ' of ' + symbol + ' on ' + currentQuote.date + ' for $ ' + currentQuote.close.toFixed(4) + ' totaling $' + earnings.toFixed(2) +', available cash ' + cash.toFixed(2));

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
