document.getElementById('pickTable').addEventListener('click', () => {
    startPicking('table');
});

document.getElementById('pickList').addEventListener('click', () => {
    startPicking('list');
});

document.getElementById('cancelPicking').addEventListener('click', () => {
    window.close();
});

function startPicking(elementType) {
    // Show picking mode UI
    document.getElementById('initial-buttons').classList.add('hidden');
    document.getElementById('picking-mode').classList.remove('hidden');
    
    // Send message to content script
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {
            action: 'startPicking',
            elementType: elementType
        });
    });
}