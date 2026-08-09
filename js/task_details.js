import { initProtectedPage, initSignedInAs, initBurgerMenu } from '/js/auth-ui.js';
import { createPrivateBadge, isPrivateTask } from '/js/privacy-badge.js';

// Initialize Page Protection & Navigation Components
initProtectedPage('/');
initSignedInAs();
initBurgerMenu();

// Helper to escape HTML and display safely
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Format multi-line text for display
function formatMultilineText(text) {
  if (!text) return '<em class="text-muted">None</em>';
  return escapeHtml(text).replace(/\n/g, '<br>');
}

function sanitizeModelAnswerText(text) {
  if (!text) return '';

  const normalized = String(text)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  if (!normalized.includes('<input')) {
    return normalized;
  }

  const container = document.createElement('div');
  container.innerHTML = normalized;
  container.querySelectorAll('input.text-box').forEach((input) => {
    input.replaceWith(input.value || '');
  });

  return container.textContent.replace(/\u00a0/g, ' ');
}

// Parse custom error rules safely
function parseCustomErrorRules(rawRules) {
  if (!rawRules) return [];
  if (Array.isArray(rawRules)) return rawRules;
  try {
    const parsed = typeof rawRules === 'string' ? JSON.parse(rawRules) : rawRules;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('Failed to parse custom error rules:', e);
    return [];
  }
}

// Convert doctest examples into assert statements for visual display
function convertDoctestsToAsserts(header) {
  if (!header) return '';
  
  // Find docstring contents
  let docstring = '';
  const firstQuote = header.indexOf('"""');
  const lastQuote = header.lastIndexOf('"""');
  if (firstQuote !== -1 && lastQuote !== -1 && firstQuote !== lastQuote) {
    docstring = header.substring(firstQuote + 3, lastQuote);
  } else {
    const firstSingle = header.indexOf("'''");
    const lastSingle = header.lastIndexOf("'''");
    if (firstSingle !== -1 && lastSingle !== -1 && firstSingle !== lastSingle) {
      docstring = header.substring(firstSingle + 3, lastSingle);
    }
  }
  
  if (!docstring) return '';
  
  const lines = docstring.split('\n').map(l => l.trim());
  const asserts = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('>>>')) {
      const expr = line.substring(3).trim();
      // Check the next line for the expected return value
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        // Ensure it's not another doctest command or line continuation
        if (nextLine && !nextLine.startsWith('>>>') && !nextLine.startsWith('...')) {
          asserts.push(`assert ${expr} == ${nextLine}`);
          i++; // Skip expected output line
        }
      }
    }
  }
  
  return asserts.join('\n');
}

// Main page logic
async function loadTaskDetails() {
  const urlParams = new URLSearchParams(window.location.search);
  const taskId = urlParams.get('id');

  if (!taskId) {
    showErrorPage('No Task ID provided in URL.');
    return;
  }

  try {
    // 1. Fetch task details
    const response = await fetch(`/api/tasks/${taskId}`);
    if (!response.ok) {
      if (response.status === 404) {
        showErrorPage('Task not found.');
      } else {
        showErrorPage(`Error loading task: ${response.statusText}`);
      }
      return;
    }
    const task = await response.json();

    // 2. Render Header Information
    const titleEl = document.getElementById('details-task-title');
    const subtitleEl = document.getElementById('details-task-subtitle');
    const badgeContainer = document.getElementById('task-badge-container');

    titleEl.textContent = task.title;
    subtitleEl.textContent = `Task ID: ${task.id} • Created ${new Date(task.created_at).toLocaleDateString()}`;

    // Clear and populate badges
    badgeContainer.innerHTML = '';
    
    // Privacy Badge
    if (isPrivateTask(task)) {
      badgeContainer.appendChild(createPrivateBadge());
    } else {
      const publicBadge = document.createElement('span');
      publicBadge.className = 'badge badge-success';
      publicBadge.innerHTML = '<i class="fas fa-globe"></i> Public';
      badgeContainer.appendChild(publicBadge);
    }

    // Task Type Badge
    const typeBadge = document.createElement('span');
    typeBadge.className = 'badge badge-info ml-2';
    typeBadge.innerHTML = `<i class="fas fa-tag"></i> ${task.task_type || 'normal'}`;
    badgeContainer.appendChild(typeBadge);

    // 3. Setup Navigation buttons
    document.getElementById('action-run-task').href = `/task?id=${task.id}`;
    document.getElementById('action-stats-task').href = `/task-statistics?id=${task.id}`;

    // Check if task is editable and configure button
    try {
      const editableResp = await fetch(`/api/problems/${task.id}/editable`);
      if (editableResp.ok) {
        const editableData = await editableResp.json();
        if (editableData.editable) {
          const editBtn = document.getElementById('action-edit-task');
          editBtn.href = `/create-task-editor?task_id=${task.id}`;
          editBtn.style.display = 'inline-flex';
        }
      }
    } catch (err) {
      console.warn('Failed to check edit status:', err);
    }

    // 4. Start Page Intro & Problem Statement
    document.getElementById('details-start-intro').innerHTML = formatMultilineText(task.description);

    let problemText = '';
    try {
      const instructionsObj = typeof task.task_instructions === 'string' 
        ? JSON.parse(task.task_instructions) 
        : task.task_instructions;
      
      if (instructionsObj.function_name) {
        problemText += `<strong>${escapeHtml(instructionsObj.function_name)}</strong><br>`;
      }
      problemText += formatMultilineText(instructionsObj.task_instructions || task.task_instructions);
      if (instructionsObj.examples) {
        problemText += `<br><br><strong>Examples:</strong><pre style="margin-top: 0.5rem; background: #f1f5f9; padding: 0.75rem; border-radius: 6px;"><code>${escapeHtml(instructionsObj.examples)}</code></pre>`;
      }
    } catch (e) {
      problemText = formatMultilineText(task.task_instructions);
    }
    document.getElementById('details-problem-statement').innerHTML = problemText;

    const blocks = task.code_blocks?.blocks || [];
    const correctOrder = task.correct_solution?.correct_order || [];

    // 5. Model Answer (Display as raw text block with .model-code class, exactly like statistics)
    const modelCodeEl = document.getElementById('details-model-code');
    const modelCode = task.model_answer || task.correct_solution?.solution_code || '';
    const sanitizedModelCode = sanitizeModelAnswerText(modelCode).trim();
    modelCodeEl.textContent = sanitizedModelCode || 'No model answer configured.';

    // 6. Test Cases Code (Fetch correctly as assert statement block)
    const testsCodeEl = document.getElementById('details-tests-code');
    let testsCode = task.correct_solution?.teacher_tests || '';
    if (!testsCode.trim() && task.code_blocks?.function_header) {
      testsCode = convertDoctestsToAsserts(task.code_blocks.function_header);
    }
    testsCodeEl.textContent = testsCode.trim() || 'No tests configured.';

    // 7. Custom Error Messages
    const errContainer = document.getElementById('details-err-container');
    const errCountBadge = document.getElementById('details-err-count');
    const rawErrorMessages = task.correct_solution?.custom_error_messages;
    const errorRules = parseCustomErrorRules(rawErrorMessages);

    errCountBadge.textContent = `${errorRules.length} ${errorRules.length === 1 ? 'rule' : 'rules'}`;

    if (errorRules.length > 0) {
      errContainer.innerHTML = '';
      const grid = document.createElement('div');
      grid.className = 'err-rules-grid';
      
      errorRules.forEach(rule => {
        const card = document.createElement('div');
        card.className = 'err-rule-card';
        
        card.innerHTML = `
          <div class="err-rule-header">
            <i class="fas fa-search"></i> If output/error contains
          </div>
          <div class="err-rule-pattern">${escapeHtml(rule.pattern)}</div>
          <div class="err-rule-header" style="margin-top: 0.25rem;">
            <i class="fas fa-arrow-right"></i> Student sees custom message
          </div>
          <div class="err-rule-message">${escapeHtml(rule.message)}</div>
        `;
        grid.appendChild(card);
      });
      errContainer.appendChild(grid);
    }

    // 8. Configured Code Blocks (Full list including distractors)
    const blocksContainer = document.getElementById('details-blocks-container');
    const blocksSummary = document.getElementById('details-blocks-summary');
    const correctOrderSet = new Set(correctOrder);

    blocksSummary.textContent = `${blocks.length} configured block${blocks.length === 1 ? '' : 's'}`;

    if (blocks.length > 0) {
      blocksContainer.innerHTML = '';
      
      blocks.forEach((block) => {
        const isSolution = correctOrderSet.has(block.id);
        const isPinned = block.given === true;
        
        const blockEl = document.createElement('div');
        blockEl.className = 'block-item';
        
        if (isPinned) {
          blockEl.classList.add('pinned-block');
        } else if (isSolution) {
          blockEl.classList.add('solution-block');
        } else {
          blockEl.classList.add('distractor-block');
        }

        // Apply indentation padding
        const indentLevel = block.indent || 0;
        blockEl.style.paddingLeft = `${Math.max(1.25, indentLevel * 2 + 1.25)}rem`;

        const sanitizedBlockCode = sanitizeModelAnswerText(block.code || '');
        const formattedCode = escapeHtml(sanitizedBlockCode)
          .replace(/(!BLANK|___)/g, '<span class="faded-blank">___</span>');

        // Build Badge HTML
        let badgeHtml = '';
        if (isPinned) {
          badgeHtml = '<span class="block-badge badge-pin"><i class="fas fa-thumbtack"></i> Pinned / Given</span>';
        } else if (isSolution) {
          badgeHtml = '<span class="block-badge badge-sol"><i class="fas fa-check"></i> Solution Block</span>';
        } else {
          badgeHtml = '<span class="block-badge badge-dist"><i class="fas fa-times"></i> Distractor</span>';
        }

        blockEl.innerHTML = `
          <div class="d-flex align-items-center gap-2">
            ${isPinned ? '<span class="text-primary mr-1" title="Pinned block">📌</span>' : ''}
            <code style="color: inherit; font-size: inherit;">${formattedCode}</code>
          </div>
          <div>${badgeHtml}</div>
        `;
        
        blocksContainer.appendChild(blockEl);
      });
    } else {
      blocksContainer.innerHTML = '<div class="empty-display"><i class="fas fa-cubes"></i> No blocks configured.</div>';
    }

  } catch (err) {
    console.error('Failed to load task details:', err);
    showErrorPage(`An unexpected error occurred: ${err.message}`);
  }
}

function showErrorPage(message) {
  const container = document.querySelector('.dashboard-main');
  if (container) {
    container.innerHTML = `
      <div class="card p-5 text-center shadow-sm" style="border-radius: 12px;">
        <i class="fas fa-exclamation-triangle text-danger" style="font-size: 3rem; margin-bottom: 1rem;"></i>
        <h4 class="font-weight-bold">Error Loading Details</h4>
        <p class="text-muted">${escapeHtml(message)}</p>
        <a href="/teacher-dashboard" class="btn btn-primary mt-3" style="width: fit-content; margin: 0 auto;">
          <i class="fas fa-arrow-left"></i> Back to Dashboard
        </a>
      </div>
    `;
  }
}

// Run loader on load
window.addEventListener('DOMContentLoaded', loadTaskDetails);
