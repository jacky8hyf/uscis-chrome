var utils = (function() {
    // local vars
    const BASEURL = "https://egov.uscis.gov/casestatus/mycasestatus.do";
    const PREFIX_LENGTH = 3;
    const RECORD_PREFIX = 'record_';
    const ROW_TEMPLATE_ID = "table-row-template";
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
        chrome.storage.sync.set(items, function() {
            if(chrome.runtime.lastError)
                dfd.reject(chrome.runtime.lastError);
            else
                dfd.resolve(items);
        });
        return dfd.promise();
    }

    function shortDate(date) {
        date = new Date(date).toISOString();
        return date.slice(5,10) + ' ' + date.slice(11,16)
    }

    function keyValue(key, value) {
        var d = {}; d[key] = value; return d;
    }

    function delay(ms){ // http://stackoverflow.com/a/24188270
        var d = $.Deferred();
        setTimeout(function(){ d.resolve(); }, ms);
        return d.promise();
    }
    function rejectPromise(e) {
        return $.Deferred().reject(e).promise();
    }
    function wrapFailPromise(p) {
        var dfd = $.Deferred();
        p.then(function() {
            var args = Array.prototype.slice.call(arguments);
            args.splice(0, 0, true)
            dfd.resolve.apply(dfd, args)
        }, function() {
            var args = Array.prototype.slice.call(arguments);
            args.splice(0, 0, false)
            dfd.resolve.apply(dfd, args)
        }, function() {
            dfd.notify.apply(dfd, arguments)
        });
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
        }, function(xhr, ajaxOptions, thrownError) {
            dfd.reject('Error connecting to USCIS.');
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
            dfd.notify(numToTry);
            tryFetchStatus(receiptNum, numToTry, dfd);
        });
        return dfd;
    }

    /** Fetch several times. 
     *  @return a new promise. */
    function fetchStatus(receiptNum) {
        return tryFetchStatus(receiptNum, 5, $.Deferred());
    }

    function recordIsSuccess(record) {
        return record.status !== undefined && record.date !== undefined;
    }

    function wrapRecordToMessage(record) {
        if(recordIsSuccess(record)) 
            return record.status + ' (' + shortDate(record.date) + ')'
        return record.error_status + ' (' + shortDate(record.error_date) + ')'
    }

    function fetchStatusAndSave(receiptNum) {
        var key = (RECORD_PREFIX + receiptNum)
        return $.when(storageGet(keyValue(key, {})), wrapFailPromise(fetchStatus(receiptNum)))
          .then(function(record, statusAndMessage) {
            var isSuccess = statusAndMessage[0], message = statusAndMessage[1];
            if(isSuccess) {
                record = { status: message, date: new Date().getTime() }
            } else {
                record['error_status'] = message;
                record['error_date'] = new Date().getTime();
            }
            return $.when(isSuccess, storageSet(keyValue(key, record)))
        }, null, function(progress1, progress2) {
            return progress2;
        }).then(function(isSuccess, savedRecords) {
            var msg = wrapRecordToMessage(savedRecords[key]);
            return isSuccess ? msg : rejectPromise(msg);
        });
    }

    function createRows(count) {
        var rowDiv = $('#' + ROW_TEMPLATE_ID).clone();
        var row = rowDiv.find('tr');
        rowDiv.html('');
        for(var i = 0; i < count; i++) {
            var newRow = row.clone();
            newRow.addClass("table-row-" + i);
            rowDiv.append(newRow)
        }
        return rowDiv.html()
    }

    function onload() {
        // onload here
        storageGet({'lastReceiptNum': '', 'lastCount':''}).then(function(items) {
            $('.form-query .input-receipt-num').val(items.lastReceiptNum)
            $('.form-query .input-count').val(items.lastCount)
        });
        storageGet(null).then(function(items) {
            var keys = $.map(items, function(v, k){ return k.startsWith(RECORD_PREFIX) ? k : undefined; });
            return $.when(storageGet(keys), items.lastReceiptNum);
        }).then(function(records, lastReceiptNum) {
            var count = 0;
            $.each(records, function() { count++; });
            var table = $('.table-query-result');
            var tbody = table.find('tbody');
            tbody.html(createRows(count));
            var index = 0;
            var recordHandler = function(k, v) {
                k = k.substr(RECORD_PREFIX.length)
                v = wrapRecordToMessage(v)
                var row = tbody.find('tr.table-row-' + index)
                row.find('.table-col-receipt-num').text(k);
                row.find('.table-col-result').text(v);
                if(!recordIsSuccess(v)) row.addClass('danger');
                index++;
            }
            $.each(records, recordHandler);

            var lastReceiptNumKey = RECORD_PREFIX + lastReceiptNum
            if(lastReceiptNum && (lastReceiptNumKey in records)) {
                var preRow = $(createRows( 1))
                    .removeClass().addClass('table-row-' + index);
                tbody.prepend(preRow);
                recordHandler(lastReceiptNumKey, records[lastReceiptNumKey]);
            }
        })
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
            var preRow = $(createRows( 1))
                .removeClass().addClass('table-row-' + (receiptNum - start));
            table.find('tbody').html(preRow).append(
                createRows( count));
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
        fetchStatusOnce: fetchStatusOnce
    }
})();
