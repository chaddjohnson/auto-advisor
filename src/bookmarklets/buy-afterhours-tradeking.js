(function() {
    var symbol, commission, buyingPower, defaultInvestment, amount, askPricePadding, shares, lastAskPrice, priceDisplayInterval;

    // Clear timeouts to reset things.
    if (window.bookmarkletQuoteTimeout) {
        window.clearTimeout(window.bookmarkletQuoteTimeout);
    }
    if (window.bookmarkletUpdateTimeout) {
        window.clearTimeout(window.bookmarkletUpdateTimeout);
    }

    commission = 4.95;
    symbol = prompt('Symbol');

    // Find the day trading buying power.
    buyingPower = parseFloat(jQuery('#balanceTable tbody tr:nth-child(1) .BalDataRowCash').text().replace(/[\$\,]/g, '')) * 0.95;
    defaultInvestment = 10000;

    // Do not let the investment exceed the buying power.
    if (defaultInvestment > buyingPower) {
        defaultInvestment = buyingPower - commission;
    }

    // Round to two decimals.
    defaultInvestment = parseFloat(defaultInvestment.toFixed(2));

    // Ask for the amount to trade, defaulting to the buying power.
    amount = parseFloat(prompt('Amount', defaultInvestment).replace(/[\$\,]/g, ''));

    askPricePadding = parseFloat(prompt('Ask price padding %', 0));

    // Select "Buy".
    jQuery('#transaction_1').click();

    window.setTimeout(function() {
        // Enter the symbol.
        jQuery('#symbol').focus();
        jQuery('#symbol').val(symbol);
        jQuery('#symbol').blur();

        updateShares();
    }, 100);

    function updateShares() {
        // Click the Refresh button.
        jQuery('#refreshButton').click();

        // Wait for the response.
        window.bookmarkletQuoteTimeout = window.setTimeout(function() {
            // Find the ask, bid, and last prices.
            var askPrice = parseFloat(jQuery('#quotePanelAsk0').text()) * (1 + (askPricePadding / 100));
            var bidPrice = parseFloat(jQuery('#quotePanelBid0').text());
            var lastPrice = parseFloat(jQuery('#quotePanelLast0').text());
            var change = ((bidPrice / lastPrice - 1) * 100);

            if (askPrice !== lastAskPrice) {
                // Calculate the number of shares that can be purchased using the amount.
                shares = Math.floor((amount - commission) / askPrice);

                // Enter the number of shares.
                if (shares && shares !== Infinity) {
                    jQuery('#amount').val(shares);
                }
                else {
                    jQuery('#amount').val('');
                }

                // Enter the limit price.
                if (askPrice) {
                    jQuery('#limitPrice').val(askPrice.toFixed());
                }
                else {
                    jQuery('#limitPrice').val('');
                }

                window.clearInterval(priceDisplayInterval);

                priceDisplayInterval = window.setInterval(function() {
                    // Update the "Change" display.
                    jQuery('#quotePanelPctChange0 span').text('[' + change.toFixed(2) + '%]')

                    // Update the "Change" display color.
                    if (change > 0) {
                        jQuery('#quotePanelPctChange0 span').removeClass('negative').addClass('positive');
                        jQuery('#quotePanelChange0 span').removeClass('negative').addClass('positive');
                        jQuery('#quotePanelChange0 span').html((bidPrice - lastPrice).toFixed(2) + '<img src="https://investor.tradeking.com/Web/Images/Icons/gain.gif">');
                    }
                    else {
                        jQuery('#quotePanelPctChange0 span').removeClass('positive').addClass('negative');
                        jQuery('#quotePanelChange0 span').removeClass('positive').addClass('negative');
                        jQuery('#quotePanelChange0 span').html((bidPrice - lastPrice).toFixed(2) + '<img src="https://investor.tradeking.com/Web/Images/Icons/loss.gif">');
                    }
                }, 10);
            }

            lastAskPrice = askPrice;

            window.bookmarkletUpdateTimeout = window.setTimeout(updateShares, 2000);
        }, 500);
    }
})();
