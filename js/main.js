var mainFunctions = (function() {
    // local vars
    var BASEURL = "https://egov.uscis.gov/casestatus/mycasestatus.do";

    function delay(ms){ // http://stackoverflow.com/a/24188270
        var d = $.Deferred();
        setTimeout(function(){ d.resolve(); }, ms);
        return d.promise();
    }
    function rejectPromise(e) {
        var dfd = $.Deferred();
        dfd.reject(e);
        return dfd.promise();
    }

    function fetchStatusOnce(receiptNum) {
        var dfd = $.Deferred();
        $.post(BASEURL, {appReceiptNum : receiptNum}).then(function(html, textStatus, jqXHR) {
            html = html.replace(/<img[^>]*>/g,""); // http://stackoverflow.com/a/15113974
            var page = $(html);
            var error = page.find('#formErrorMessages').text();
            if(!/^\s*$/.test(error)) {
                var errmsg = page.find('#formErrorMessages li').text();
                dfd.reject(errmsg);
                return;
            }
            if(page.find('label[for=accessviolation]')) {
                dfd.reject('IP blocked.')
                return;
            }
            var detailedMessage = page.find('form[name=caseStatusForm] h1 + p').text()
            if(detailedMessage.indexOf(receiptNum) < 0) {
                var butis = detailedMessage.substr(detailedMessage.indexOf(receiptNum.substr(0,3)), receiptNum.length)
                dfd.reject('USCIS returns wrong response (expected ' + receiptNum + ', but is ' + butis)
                return;
            }
            var msg = page.find('form[name=caseStatusForm] h1').text();
            if(!/^\s*$/.test(msg)) {
                dfd.resolve(msg);
                return;
            }
            dfd.reject('could not analyze reponse from USCIS.');
        }, function(e) {
            dfd.reject(e);
        });
        return dfd.promise();
    }

    function tryFetchStatus(receiptNum, numToTry, dfd) {
        fetchStatusOnce(receiptNum).then(function(msg) {dfd.resolve(msg)}, function(e) {
            numToTry--;
            if(numToTry == 0) {
                dfd.reject(e);
                return;
            }
            dfd.notify(numToTry)
            tryFetchStatus(receiptNum, numToTry, dfd)
        });
        return dfd;
    }

    function fetchStatus(receiptNum) {
        return tryFetchStatus(receiptNum, 5, $.Deferred());
    }

    function onload() {
        // onload here
        $('.btn-query').click(function(event) {
            event.preventDefault();
            var receiptStr = $('.form-query .input-receipt-num').val();
            var count = parseInt($('.form-query .input-count').val());
            var prefix = receiptStr.substr(0, 3);
            var receiptNum = parseInt(receiptStr.substr(3));
            var start = receiptNum - ~~(count / 2);
            var table = $('.table-query-result');
            preRow = $(tmpl(table.attr('template-id'), {count: 1}))
                .removeClass().addClass('table-row-' + (receiptNum - start));
            table.find('tbody').html(preRow).append(
                tmpl(table.attr('template-id'), {count: count}));
            table.find('tbody tr.table-row-' + (receiptNum - start)).addClass('success')
            for(var i = 0; i < count; i++) {
                (function(num, i){
                    fetchStatus(prefix + num).then(function(msg) {
                        var row = table.find('.table-row-' + i);
                        row.find('.table-col-receipt-num').text(prefix + num);
                        row.find('.table-col-result').text(msg)
                        row.removeClass('warning danger')
                    }, function(msg){
                        var row = table.find('.table-row-' + i);
                        row.find('.table-col-receipt-num').text(prefix + num);
                        row.find('.table-col-result').text(msg)
                        row.removeClass('warning').addClass('danger')
                    }, function(retry_count) {
                        var row = table.find('.table-row-' + i);
                        row.find('.table-col-receipt-num').text(prefix + num);
                        row.find('.table-col-result').text("Retrying... (" + retry_count + " times left)")
                        row.addClass('warning')
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