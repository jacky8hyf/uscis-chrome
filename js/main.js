var mainFunctions = (function() {
    // local vars
    var BASEURL = "https://egov.uscis.gov/casestatus/mycasestatus.do";

    function fetchStatus(receiptNum) {
        var dfd = jQuery.Deferred();
        $.post(BASEURL, {appReceiptNum : receiptNum}).done(function(html) {
            html = html.replace(/<img[^>]*>/g,""); // http://stackoverflow.com/a/15113974
            var page = $(html);
            var error = page.find('#formErrorMessages').text();
            if(!/^\s*$/.test(error)) {
                var errmsg = page.find('#formErrorMessages li').text();
                dfd.reject(errmsg);
                return;
            }
            var msg = page.find('form[name=caseStatusForm] h1').text();
            if(!/^\s*$/.test(msg)) {
                dfd.resolve(msg);
                return;
            }
            dfd.reject('could not analyze reponse from USCIS.');
        }).fail(function(e) {
            dfd.reject(e);
        });
        return dfd.promise();
    }

    function onload() {
        // onload here
        $('.btn-query').click(function(event) {
            event.preventDefault();
            var receiptNum = $('.form-query .input-receipt-num').val()
            var count = parseInt($('.form-query .input-count').val());
            var prefix = receiptNum.substr(0, 3);
            var start = parseInt(receiptNum.substr(3));
            var table = $('.table-query-result');
            table.find('tbody').html(
                tmpl(table.attr('template-id'), {count: count}));
            for(var i = 0; i < count; i++) {
                (function(num, i){
                    fetchStatus(prefix + num).then(function(msg) {
                        var row = table.find('.table-row-' + i);
                        row.find('.table-col-receipt-num').text(prefix + num);
                        row.find('.table-col-result').text(msg)
                    }, function(msg){
                        var row = table.find('.table-row-' + i);
                        row.find('.table-col-receipt-num').text(prefix + num);
                        row.find('.table-col-result').text(msg)
                    })
                })(start + i, i);
            }
        })
    }




    return {
        onload: onload,
    }
})();
window.addEventListener('load', mainFunctions.onload);