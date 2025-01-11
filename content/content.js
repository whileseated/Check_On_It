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

    // Add button container with both CSV and Invert buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'csv-button-container';
    buttonContainer.innerHTML = `
        <button class="invert-selection-btn">Invert Selection</button>
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

    // Add drag selection variables
    let isDragging = false;
    let lastCheckedState = null;
    let mouseDownTime = 0;

    // Add mousedown event to start dragging
    table.addEventListener('mousedown', (e) => {
        const checkbox = e.target.closest('.row-checkbox');
        if (checkbox) {
            mouseDownTime = Date.now();
            isDragging = false;
            lastCheckedState = checkbox.checked;
        }
    });

    // Add mousemove event to detect drag
    document.addEventListener('mousemove', (e) => {
        if (!mouseDownTime) return;
        
        // Only start dragging if mouse has been down for a bit
        if (!isDragging && Date.now() - mouseDownTime > 200) {
            isDragging = true;
        }
        
        if (isDragging) {
            const checkbox = e.target.closest('.row-checkbox');
            if (checkbox) {
                checkbox.checked = !lastCheckedState;
            }
        }
    });

    // Add mouseup event to stop dragging
    document.addEventListener('mouseup', (e) => {
        isDragging = false;
        mouseDownTime = 0;
        
        // Update select all checkbox state
        if (selectAllCheckbox) {
            const allChecked = Array.from(rowCheckboxes).every(cb => cb.checked);
            const someChecked = Array.from(rowCheckboxes).some(cb => cb.checked);
            
            selectAllCheckbox.checked = allChecked;
            selectAllCheckbox.indeterminate = someChecked && !allChecked;
        }
    });

    // Add mouseleave event to handle when mouse leaves the table
    table.addEventListener('mouseleave', () => {
        isDragging = false;
        mouseDownTime = 0;
    });

    // CSV download button functionality
    const downloadBtn = table.nextElementSibling.querySelector('.csv-download-btn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            const csvContent = generateTableCSV(table);
            downloadCSV(csvContent, 'table-data.csv');
        });
    }

    // Add invert selection button functionality
    const invertBtn = table.nextElementSibling.querySelector('.invert-selection-btn');
    if (invertBtn) {
        invertBtn.addEventListener('click', () => {
            const rowCheckboxes = table.querySelectorAll('.row-checkbox');
            rowCheckboxes.forEach(checkbox => {
                checkbox.checked = !checkbox.checked;
            });

            // Update select all checkbox state
            const selectAllCheckbox = table.querySelector('.select-all-checkbox');
            if (selectAllCheckbox) {
                const allChecked = Array.from(rowCheckboxes).every(cb => cb.checked);
                const someChecked = Array.from(rowCheckboxes).some(cb => cb.checked);
                
                selectAllCheckbox.checked = allChecked;
                selectAllCheckbox.indeterminate = someChecked && !allChecked;
            }
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
                // Get only visible text content and links
                let cellText = '';
                
                // Get text from links if present
                const links = cell.querySelectorAll('a');
                if (links.length > 0) {
                    cellText = Array.from(links)
                        .map(link => link.textContent.trim())
                        .filter(text => text) // Remove empty strings
                        .join(' ');
                } else {
                    // If no links, get direct text content
                    cellText = cell.textContent;
                }

                // Clean the text
                cellText = cellText
                    .replace(/,/g, ';') // Replace commas with semicolons
                    .replace(/[\n\r]+/g, ' ') // Replace newlines with spaces
                    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
                    .trim();

                // Skip empty or style-only content
                if (cellText && !cellText.startsWith('.mw-parser')) {
                    rowData.push(`"${cellText}"`);
                } else {
                    rowData.push('""'); // Empty cell if no valid content
                }
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

function enhanceList(list) {
    // Add style to hide list markers
    list.style.listStyleType = 'none';
    
    // Only get list items that have actual content
    const items = Array.from(list.querySelectorAll('li')).filter(item => {
        const hasText = item.textContent.trim().length > 0;
        const hasLinks = item.querySelector('a');
        return hasText && hasLinks; // Only keep items with both text and links
    });
    
    items.forEach(item => {
        // Remove the value attribute and any list styling
        item.removeAttribute('value');
        item.style.listStyleType = 'none';
        
        // Create checkbox wrapper
        const checkboxWrapper = document.createElement('span');
        checkboxWrapper.className = 'list-checkbox-wrapper';
        checkboxWrapper.innerHTML = '<input type="checkbox" class="row-checkbox">';
        
        // Insert at the beginning of the list item
        item.insertBefore(checkboxWrapper, item.firstChild);
    });

    // Add button container
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'csv-button-container';
    buttonContainer.innerHTML = `
        <button class="invert-selection-btn">Invert Selection</button>
        <button class="csv-download-btn">Download as CSV</button>
    `;
    list.parentNode.insertBefore(buttonContainer, list.nextSibling);

    // Add event listeners
    setupListEventListeners(list);
}

function setupListEventListeners(list) {
    const rowCheckboxes = list.querySelectorAll('.row-checkbox');
    
    // Add drag selection variables
    let isDragging = false;
    let lastCheckedState = null;
    let mouseDownTime = 0;

    // Add mousedown event to start dragging
    list.addEventListener('mousedown', (e) => {
        const checkbox = e.target.closest('.row-checkbox');
        if (checkbox) {
            mouseDownTime = Date.now();
            isDragging = false;
            lastCheckedState = checkbox.checked;
        }
    });

    // Add mousemove event to detect drag
    document.addEventListener('mousemove', (e) => {
        if (!mouseDownTime) return;
        
        if (!isDragging && Date.now() - mouseDownTime > 200) {
            isDragging = true;
        }
        
        if (isDragging) {
            const checkbox = e.target.closest('.row-checkbox');
            if (checkbox) {
                checkbox.checked = !lastCheckedState;
            }
        }
    });

    // Add mouseup event to stop dragging
    document.addEventListener('mouseup', () => {
        isDragging = false;
        mouseDownTime = 0;
    });

    // Add mouseleave event to handle when mouse leaves the list
    list.addEventListener('mouseleave', () => {
        isDragging = false;
        mouseDownTime = 0;
    });

    // CSV download button functionality
    const downloadBtn = list.nextElementSibling.querySelector('.csv-download-btn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            const csvContent = generateListCSV(list);
            downloadCSV(csvContent, 'list-data.csv');
        });
    }

    // Add invert selection button functionality
    const invertBtn = list.nextElementSibling.querySelector('.invert-selection-btn');
    if (invertBtn) {
        invertBtn.addEventListener('click', () => {
            rowCheckboxes.forEach(checkbox => {
                checkbox.checked = !checkbox.checked;
            });
        });
    }
}

function generateListCSV(list) {
    const items = list.querySelectorAll('li');
    const csvRows = ['Selected,Text'];  // Add header row

    items.forEach(item => {
        const rowData = [];
        // Add checkbox state
        const checkbox = item.querySelector('.row-checkbox');
        if (!checkbox) return;
        
        rowData.push(checkbox.checked ? '✓' : '');
        
        // Create a clone of the item to manipulate
        const itemClone = item.cloneNode(true);
        
        // Remove the checkbox wrapper and any reference/citation elements
        itemClone.querySelector('.list-checkbox-wrapper')?.remove();
        itemClone.querySelectorAll('sup.reference')?.forEach(sup => sup.remove());
        
        // Get the text content directly, preserving original formatting
        let itemText = itemClone.textContent
            .replace(/^(\d+)\.\s+(?=.)/, '') // Only remove numbers followed by a period at the start of the line
            .replace(/\s+/g, ' ') // Normalize spaces only
            .trim();

        if (itemText) {
            // Escape quotes in the text and wrap in quotes for CSV
            itemText = `"${itemText.replace(/"/g, '""')}"`;
            rowData.push(itemText);
            csvRows.push(rowData.join(','));
        }
    });

    return csvRows.join('\n');
}