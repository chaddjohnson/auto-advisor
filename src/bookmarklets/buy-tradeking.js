;(function() {
    var symbol, commission, balance, askPrice, shares;

    commission = 4.95;
    symbol = jQuery('#symbol').val() || prompt('Symbol');

    // Find the balance.
    balance = parseFloat(jQuery('#balanceTable tbody tr:nth-child(4) .BalDataRowCash').text().replace(/[\$\,]/g, ''));

    // Select "Buy".
    jQuery('#transaction_1').click();

    // Select "Market".
    jQuery('#ordType_1').click();

    // Enter the symbol.
    window.setTimeout(function() {
        jQuery('#symbol').focus();
        jQuery('#symbol').val(symbol);
        jQuery('#symbol').blur();
    }, 100);

    window.setTimeout(function() {
        // Find the ask price.
        askPrice = parseFloat(jQuery('#quotePanelAsk0').text());

        // Calculate the number of shares that can be purchased using the balance.
        shares = Math.floor((balance - commission) / askPrice);

        // Enter the number of shares.
        jQuery('#amount').val(shares);
    }, 1000);
})();
