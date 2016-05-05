var mainFunctions = (function() {
    // local vars
    const BASEURL = "https://egov.uscis.gov/casestatus/mycasestatus.do";
    const PREFIX_LENGTH = 3;

    function storageGet(keys) {
        var dfd = $.Deferred();
        chrome.storage.sync.get(keys, function(items) {
            if(chrome.runtime.lastError)
                dfd.reject(chrome.runtime.lastError);
            else
                dfd.resolve(items);
        });
        return dfd.promise();
    }

    function storageSet(items) {
        var dfd = $.Deferred();
        chrome.storage.sync.get(items, function() {
            if(chrome.runtime.lastError)
                dfd.reject(chrome.runtime.lastError);
            else
                dfd.resolve();
        });
        return dfd.promise();
    }

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

    /** Helper to fetchStatus.
     *  Try to fetch multiple times. When done, resolve dfd. */
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

    /** Fetch several times. 
     *  @return a new promise. */
    function fetchStatus(receiptNum) {
        return tryFetchStatus(receiptNum, 5, $.Deferred());
    }

    function fetchStatusAndSave(receiptNum) {
        // storageGet({'record_' + receiptNum : {}}).then(function(items))
        return fetchStatus(receiptNum); // FIXME
    }

    function onload() {
        // onload here
        storageGet({'lastReceiptNum': '', 'lastCount':''}).then(function(items) {
            $('.form-query .input-receipt-num').val(items.lastReceiptNum)
            $('.form-query .input-count').val(items.lastCount)
        });
        $('.btn-query').click(function(event) {
            event.preventDefault();
            var receiptStr = $('.form-query .input-receipt-num').val();
            var count = $('.form-query .input-count').val();
            storageSet({
                'lastReceiptNum': receiptStr,
                'lastCount': count
            });
            count = parseInt(count);
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
                    fetchStatusAndSave(prefix + num).then(function(msg) {
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