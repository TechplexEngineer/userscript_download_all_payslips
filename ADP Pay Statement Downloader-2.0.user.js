// ==UserScript==
// @name         ADP Pay Statement Downloader
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Download all ADP pay statements as PDFs (auto-detects OID)
// @author       You
// @match        https://my.adp.com/*
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    GM_registerMenuCommand('⬇️ Download All Pay Statements', startDownload);

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function xhrGet(url) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url);
            xhr.withCredentials = true; // send cookies
            xhr.onload = function() {
                if (xhr.status === 200) {
                    resolve(xhr.responseText);
                } else {
                    reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
                }
            };
            xhr.onerror = () => reject(new Error('Network error'));
            xhr.send();
        });
    }

    async function getOID() {
        const response = await xhrGet('https://my.adp.com/myadp_prefix/myadpapi/core/v1/version');
        const data = JSON.parse(response);
        const oid = data.associateoid;
        if (!oid) {
            console.log('ADP Downloader - Version API response:', data);
            throw new Error('Could not find associateoid in version response.');
        }
        return oid;
    }

    async function startDownload() {
        const status = document.createElement('div');
        status.style.cssText = 'position:fixed;top:10px;right:10px;z-index:99999;padding:12px 20px;background:#0073e6;color:#fff;border-radius:8px;font:14px/1.4 system-ui,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
        status.textContent = '⏳ Fetching OID...';
        document.body.appendChild(status);

        try {
            const oid = await getOID();
            status.textContent = '⏳ Fetching pay statements...';

            const rawText = await xhrGet(
                `https://my.adp.com/myadp_prefix/payroll/v1/workers/${oid}/pay-statements?adjustments=yes&numberoflastpaydates=300`
            );
            const rawData = JSON.parse(rawText);

            let lastPaydate = '';
            let consecutiveEntries = 0;
            let downloaded = 0;
            const total = rawData.payStatements.length;

            for (let index = rawData.payStatements.length - 1; index >= 0; --index) {
                const entry = rawData.payStatements[index];
                const date = entry.payDate;

                // Handle multiple paystubs on the same day
                let dateSuffix = '';
                if (date === lastPaydate) {
                    consecutiveEntries++;
                    dateSuffix = `-${consecutiveEntries}`;
                } else {
                    lastPaydate = date;
                    consecutiveEntries = 0;
                }

                const url = 'https://my.adp.com/myadp_prefix' + entry.statementImageUri.href + '?rolecode=employee';

                let trueIndex = (rawData.payStatements.length - index);
                if (trueIndex < 10) {
                    trueIndex = '00' + trueIndex;
                } else if (trueIndex < 100) {
                    trueIndex = '0' + trueIndex;
                }

                const a = document.createElement('a');
                a.download = `payslip.no.${trueIndex}.from.${entry.payDate}${dateSuffix}.pdf`;
                a.href = url;
                document.body.appendChild(a);

                await sleep(500);
                a.click();
                a.remove();

                downloaded++;
                status.textContent = `⏳ Downloading ${downloaded}/${total}...`;
            }

            status.textContent = `✅ Done! Downloaded ${total} pay statements.`;
        } catch (err) {
            console.error('ADP Downloader Error:', err);
            status.textContent = `❌ ${err.message}`;
        }

        setTimeout(() => status.remove(), 8000);
    }
})();
