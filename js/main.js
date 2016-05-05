var mainFunctions = (function() {
    // local vars
    var BASEURL = "https://egov.uscis.gov/casestatus/mycasestatus.do"

    function pad(n, width, z) {
        z = z || '0';
        n = n + '';
        return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
    }

    function onload() {
        // onload here
        for(var i = 0; i < 500; i++)
            fetch('WAC1690351' + pad(i, 3))
    }

    function fetch(receiptNum) {
        $.post(BASEURL, {appReceiptNum : receiptNum}).done(function(html) {
            html = html.replace(/<img[^>]*>/g,""); // http://stackoverflow.com/a/15113974
            var page = $(html)
            var error = page.find('#formErrorMessages').text()
            if(!/^\s*$/.test(error)) {
                var errmsg = page.find('#formErrorMessages li').text()
                console.log(receiptNum, 'error ', errmsg)
                return
            }
            var msg = page.find('form[name=caseStatusForm] h1').text()
            if(!/^\s*$/.test(msg)) {
                console.log(receiptNum, 'success ', msg)
                return
            }
            console.log(receiptNum, 'ERROR: COULD NOT EXTRACT INFO.')
        })
    }


    return {
        onload: onload,
    }
})();
window.addEventListener('load', mainFunctions.onload);