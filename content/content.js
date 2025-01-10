let isPickingElement = false;
let elementType = null; // 'table' or 'list'
let highlightedElement = null;

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'startPicking') {
        isPickingElement = true;
        elementType = request.elementType;
        enablePickingMode();
    }
});

function enablePickingMode() {
    // Add hover effect styles
    const style = document.createElement('style');
    style.id = 'picker-styles';
    style.textContent = `
        .wikipedia-enhancer-hover {
            outline: 2px solid #4285f4 !important;
            cursor: pointer !important;
        }
    `;
    document.head.appendChild(style);

    // Add mouseover and click handlers
    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    document.addEventListener('click', handleClick);
}

function handleMouseOver(e) {
    if (!isPickingElement) return;
    
    const target = elementType === 'table' 
        ? e.target.closest('table')
        : e.target.closest('ul, ol');

    if (target) {
        highlightedElement = target;
        target.classList.add('wikipedia-enhancer-hover');
    }
}

function handleMouseOut(e) {
    if (!isPickingElement) return;
    
    const target = elementType === 'table' 
        ? e.target.closest('table')
        : e.target.closest('ul, ol');

    if (target) {
        target.classList.remove('wikipedia-enhancer-hover');
    }
}

function handleClick(e) {
    if (!isPickingElement || !highlightedElement) return;

    e.preventDefault();
    e.stopPropagation();

    const selectedElement = highlightedElement; // Store reference before cleanup
    
    // Clean up first
    disablePickingMode();
    
    // Then process the element
    processSelectedElement(selectedElement);
    
    // Close the popup last
    chrome.runtime.sendMessage({ action: 'closePopup' });
}

function disablePickingMode() {
    isPickingElement = false;
    document.removeEventListener('mouseover', handleMouseOver);
    document.removeEventListener('mouseout', handleMouseOut);
    document.removeEventListener('click', handleClick);
    
    const pickerStyles = document.getElementById('picker-styles');
    if (pickerStyles) pickerStyles.remove();
    
    if (highlightedElement) {
        highlightedElement.classList.remove('wikipedia-enhancer-hover');
        highlightedElement = null;
    }
}

function processSelectedElement(element) {
    if (element.dataset.enhanced) return; // Prevent double enhancement
    
    if (elementType === 'table') {
        enhanceTable(element);
    } else {
        enhanceList(element);
    }
    
    element.dataset.enhanced = 'true';
}

function enhanceTable(table) {
    // Add checkbox column to all rows uniformly
    const rows = table.querySelectorAll('tr');
    
    rows.forEach((row, index) => {
        // Determine if this row contains headers
        const isHeaderRow = row.querySelector('th') !== null;
        
        // Create checkbox cell (th for header rows, td for data rows)
        const checkboxCell = document.createElement(isHeaderRow ? 'th' : 'td');
        checkboxCell.style.width = 'min-content'; // Make column as narrow as possible
        
        // First row gets the "select all" checkbox without label
        if (index === 0) {
            checkboxCell.innerHTML = '<input type="checkbox" class="select-all-checkbox">';
        } else {
            checkboxCell.innerHTML = '<input type="checkbox" class="row-checkbox">';
        }
        
        // Insert at the beginning of the row
        row.insertBefore(checkboxCell, row.firstChild);
    });

    // Add CSV download button
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'csv-button-container';
    buttonContainer.innerHTML = `
        <button class="csv-download-btn">Download as CSV</button>
    `;
    table.parentNode.insertBefore(buttonContainer, table.nextSibling);

    // Add event listeners
    setupTableEventListeners(table);
}

function setupTableEventListeners(table) {
    // Select all checkbox functionality
    const selectAllCheckbox = table.querySelector('.select-all-checkbox');
    const rowCheckboxes = table.querySelectorAll('.row-checkbox');
    
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            rowCheckboxes.forEach(checkbox => {
                checkbox.checked = e.target.checked;
            });
        });
    }

    // Update "select all" checkbox state when individual checkboxes change
    rowCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const allChecked = Array.from(rowCheckboxes).every(cb => cb.checked);
            const someChecked = Array.from(rowCheckboxes).some(cb => cb.checked);
            
            if (selectAllCheckbox) {
                selectAllCheckbox.checked = allChecked;
                selectAllCheckbox.indeterminate = someChecked && !allChecked;
            }
        });
    });

    // CSV download button functionality
    const downloadBtn = table.nextElementSibling.querySelector('.csv-download-btn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            const csvContent = generateTableCSV(table);
            downloadCSV(csvContent, 'table-data.csv');
        });
    }
}

function generateTableCSV(table) {
    const rows = table.querySelectorAll('tr');
    const csvRows = [];

    rows.forEach(row => {
        const rowData = [];
        // Add checkbox state as first column
        const checkbox = row.querySelector('input[type="checkbox"]');
        rowData.push(checkbox ? checkbox.checked ? '✓' : '' : 'Selected');
        
        // Add other cell data
        row.querySelectorAll('th, td').forEach((cell, index) => {
            if (index > 0) { // Skip the checkbox column
                // Clean the cell text: remove commas, newlines, and extra spaces
                const cellText = cell.textContent
                    .replace(/,/g, ';')  // Replace commas with semicolons
                    .replace(/[\n\r]+/g, ' ') // Replace newlines with spaces
                    .trim();
                rowData.push(`"${cellText}"`); // Wrap in quotes to handle special characters
            }
        });
        csvRows.push(rowData.join(','));
    });

    return csvRows.join('\n');
}

function downloadCSV(content, filename) {
    const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename || 'wikipedia-table.csv';
    document.body.appendChild(link); // Required for Firefox
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}