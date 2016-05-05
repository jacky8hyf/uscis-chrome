chrome.browserAction.onClicked.addListener(function(tab) {
  console.log('opening...')
  chrome.tabs.create({'url': chrome.extension.getURL('index.html')}, function(tab) {
    // Tab opened.
    console.log('opened')
  });
});