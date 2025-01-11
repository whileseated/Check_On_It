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

    // Remove hover effect styles
    const style = document.getElementById('picker-styles');
    if (style) style.remove();

    // Remove event listeners
    document.removeEventListener('mouseover', handleMouseOver);
    document.removeEventListener('mouseout', handleMouseOut);
    document.removeEventListener('click', handleClick);

    // Reset picking state
    isPickingElement = false;

    // Enhance the selected element
    if (elementType === 'table') {
        enhanceTable(highlightedElement);
    } else {
        enhanceList(highlightedElement);
    }

    highlightedElement = null;
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

function generateTableCSV(table) {
    const rows = table.querySelectorAll('tr');
    const csvRows = [];

    rows.forEach(row => {
        const rowData = [];
        // Get checkbox state for first column
        const checkbox = row.querySelector('.row-checkbox, .select-all-checkbox');
        rowData.push(checkbox ? (checkbox.checked ? '✓' : '') : 'Selected');

        // Get rest of the cells
        const cells = row.querySelectorAll('th, td');
        cells.forEach((cell, index) => {
            if (index === 0 && checkbox) return; // Skip our added checkbox column
            
            // Create a temporary div to get clean text content
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = cell.innerHTML;
            
            // Remove any style or script elements
            tempDiv.querySelectorAll('style, script, .mw-parser-output').forEach(el => el.remove());
            
            // Get clean text
            let text = tempDiv.textContent
                .trim()
                .replace(/,/g, ';')
                .replace(/\s+/g, ' ');
                
            rowData.push(`"${text}"`);
        });

        csvRows.push(rowData.join(','));
    });

    return csvRows.join('\n');
}

function downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
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

    // Add drag selection functionality
    let isDragging = false;
    let lastCheckedState = null;
    let mouseDownTime = 0;

    table.addEventListener('mousedown', (e) => {
        const checkbox = e.target.closest('.row-checkbox');
        if (checkbox) {
            mouseDownTime = Date.now();
            isDragging = false;
            lastCheckedState = checkbox.checked;
        }
    });

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

    document.addEventListener('mouseup', () => {
        isDragging = false;
        mouseDownTime = 0;
    });

    // Add button functionality
    const invertBtn = table.nextElementSibling.querySelector('.invert-selection-btn');
    const downloadBtn = table.nextElementSibling.querySelector('.csv-download-btn');

    if (invertBtn) {
        invertBtn.addEventListener('click', () => {
            rowCheckboxes.forEach(checkbox => {
                checkbox.checked = !checkbox.checked;
            });
        });
    }

    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            const csvContent = generateTableCSV(table);
            downloadCSV(csvContent, 'table-data.csv');
        });
    }
}

function enhanceTable(table) {
    // Add checkbox column header
    const headerRow = table.querySelector('tr');
    if (!headerRow) return;
    
    // Add header cell for checkbox column
    const headerCell = document.createElement('th');
    headerCell.innerHTML = '<input type="checkbox" class="select-all-checkbox">';
    headerRow.insertBefore(headerCell, headerRow.firstChild);

    // Add checkboxes to all rows EXCEPT the header row
    const dataRows = Array.from(table.querySelectorAll('tr')).slice(1);
    dataRows.forEach(row => {
        const cell = document.createElement('td');
        cell.innerHTML = '<input type="checkbox" class="row-checkbox">';
        row.insertBefore(cell, row.firstChild);
    });

    // Add button container
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