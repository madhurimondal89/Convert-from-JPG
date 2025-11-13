document.addEventListener('DOMContentLoaded', () => {
    // DOM Element References
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const controlsArea = document.getElementById('controls-area');
    const formatSelect = document.getElementById('format-select');
    const convertAllBtn = document.getElementById('convert-all-btn');
    const previewContainer = document.getElementById('preview-container');
    const footerActions = document.getElementById('footer-actions');
    const downloadAllBtn = document.getElementById('download-all-btn');
    const clearAllBtn = document.getElementById('clear-all-btn');
    const template = document.getElementById('file-preview-template');

    let filesMap = new Map();

    // --- Event Listeners Setup ---
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => 
        dropZone.addEventListener(eventName, preventDefaults, false)
    );
    ['dragenter', 'dragover'].forEach(eventName => 
        dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-over'), false)
    );
    ['dragleave', 'drop'].forEach(eventName => 
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-over'), false)
    );
    dropZone.addEventListener('drop', handleDrop, false);
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
    convertAllBtn.addEventListener('click', convertAllFiles);
    clearAllBtn.addEventListener('click', clearAllFiles);
    downloadAllBtn.addEventListener('click', downloadAllAsZip);
    
    // --- Core Functions ---
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function handleDrop(e) {
        handleFiles(e.dataTransfer.files);
    }

    function handleFiles(files) {
        for (const file of files) {
            if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
                const fileId = `${file.name}-${file.lastModified}`;
                if (!filesMap.has(fileId)) {
                    createFilePreview(file, fileId);
                    filesMap.set(fileId, { file, status: 'pending' });
                }
            }
        }
        updateUIState();
    }

    function createFilePreview(file, fileId) {
        const clone = template.content.cloneNode(true);
        const fileItem = clone.querySelector('.file-item');
        fileItem.dataset.id = fileId;

        const reader = new FileReader();
        reader.onload = () => {
            fileItem.querySelector('.thumbnail').src = reader.result;
        };
        reader.readAsDataURL(file);

        fileItem.querySelector('.file-name').textContent = file.name;
        fileItem.querySelector('.file-size').textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
        
        previewContainer.appendChild(clone);
    }

    async function convertAllFiles() {
        convertAllBtn.disabled = true;
        const targetFormat = formatSelect.value;
        const convertBtnSpan = convertAllBtn.querySelector('span');
        convertBtnSpan.textContent = 'Converting...';

        const promises = Array.from(filesMap.values())
            .filter(data => data.status === 'pending')
            .map(data => convertSingleFile(data, targetFormat));

        await Promise.all(promises);

        convertAllBtn.disabled = false;
        convertBtnSpan.textContent = 'Convert';
        updateUIState();
    }

    async function convertSingleFile(fileData, targetFormat) {
        const fileId = `${fileData.file.name}-${fileData.file.lastModified}`;
        const fileItem = previewContainer.querySelector(`[data-id="${fileId}"]`);
        const statusText = fileItem.querySelector('.file-status-text');
        const progressBarContainer = fileItem.querySelector('.progress-bar-container');
        const progressBarFill = fileItem.querySelector('.progress-bar-fill');
        const fileAction = fileItem.querySelector('.file-action');

        try {
            statusText.textContent = `Converting to ${targetFormat.toUpperCase()}...`;
            progressBarContainer.style.display = 'block';
            await new Promise(resolve => setTimeout(resolve, 100)); // allow UI to update
            progressBarFill.style.width = '50%';

            const formData = new FormData();
            formData.append('image', fileData.file);
            formData.append('format', targetFormat);
            
            const response = await fetch('/convert-single', { method: 'POST', body: formData });
            if (!response.ok) throw new Error('Server error');

            const blob = await response.blob();
            fileData.status = 'success';
            fileData.blob = blob;
            
            progressBarFill.style.width = '100%';
            statusText.textContent = 'Completed';

            const url = URL.createObjectURL(blob);
            const downloadBtn = document.createElement('a');
            downloadBtn.href = url;
            downloadBtn.download = `${fileData.file.name.split('.').slice(0, -1).join('.')}.${targetFormat}`;
            downloadBtn.className = 'download-icon-btn';
            downloadBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"></path><path d="m19 12-7 7-7-7"></path></svg>`;
            fileAction.innerHTML = '';
            fileAction.appendChild(downloadBtn);

        } catch (error) {
            fileData.status = 'error';
            progressBarContainer.style.display = 'none';
            statusText.textContent = 'Conversion failed';
            fileAction.innerHTML = `<svg class="status-icon error-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" y2="12"></line><line x1="12" y1="16" y2="16"></line></svg>`;
        }
    }

    function clearAllFiles() {
        filesMap.clear();
        previewContainer.innerHTML = '';
        fileInput.value = '';
        updateUIState();
    }
    
    async function downloadAllAsZip() {
        const targetFormat = formatSelect.value;
        const formData = new FormData();
        formData.append('format', targetFormat);

        let filesToZip = 0;
        filesMap.forEach(data => {
            if (data.status === 'success') {
                formData.append('images', data.file);
                filesToZip++;
            }
        });

        if (filesToZip === 0) return;

        const response = await fetch('/convert-and-zip', { method: 'POST', body: formData });
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'converted-images.zip';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    }

    function updateUIState() {
        const hasFiles = filesMap.size > 0;
        controlsArea.classList.toggle('hidden', !hasFiles);
        
        const successfulConversions = Array.from(filesMap.values()).filter(d => d.status === 'success').length;
        footerActions.classList.toggle('hidden', successfulConversions === 0);
        
        downloadAllBtn.classList.toggle('hidden', successfulConversions < 2);
    }
});