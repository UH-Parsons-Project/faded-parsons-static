export function buildReprFromBlocks(taskData) {
  const blocks = taskData.code_blocks?.blocks || [];
  const solutionCode = (taskData.correct_solution?.solution_code || '').replace(/\r\n/g, '\n');
  const modelAnswer = (taskData.model_answer || '').replace(/\r\n/g, '\n');
  const INDENT = '    ';

  const solLinesList = solutionCode.split('\n').map(l => l.trimRight());
  const ansLinesList = modelAnswer.split('\n').map(l => l.trimRight());

  // Create a list of solution line objects for sequential matching
  const solLines = solLinesList.map((solLine, idx) => ({
    solLine,
    ansLine: ansLinesList[idx] || '',
    matched: false,
  }));

  return blocks.map((block) => {
    const codeWithBlanks = block.code.replace(/___/g, '!BLANK');
    const indented = INDENT.repeat(block.indent) + block.code;

    // Find the first unmatched solution line that matches this block's indented code
    const matchItem = solLines.find(item => {
      if (item.matched) return false;
      return item.solLine.replace(/!BLANK/g, '___') === indented;
    });

    if (matchItem) {
      matchItem.matched = true;
      let blanksSuffix = '';
      const solLine = matchItem.solLine;
      const ansLine = matchItem.ansLine;

      if (solLine.includes('!BLANK') && ansLine) {
        // Extract values using regex matching
        const segments = solLine.trim().split('!BLANK');
        const escapedSegments = segments.map(seg => seg.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'));
        const regexStr = '^' + escapedSegments.join('(.*?)') + '$';
        const regex = new RegExp(regexStr);
        const match = ansLine.trim().match(regex);
        if (match) {
          const values = match.slice(1);
          blanksSuffix = values.map(val => ' #blank' + val).join('');
        }
      }

      let line = `${codeWithBlanks}${blanksSuffix} #${block.indent}given`;
      if (block.given) {
        line += ' #preplace';
      }
      return line;
    }

    return codeWithBlanks;
  }).join('\n');
}

export function buildCustomRepr(parsonsWidget, normalizeSourceCode = (s) => s, getLineInputValues = null) {
  if (!parsonsWidget) {
    return '';
  }
  const allLines = Array.isArray(parsonsWidget.modified_lines) ? parsonsWidget.modified_lines : [];
  if (!allLines.length) {
    return '';
  }

  // Find solution and trash DOM elements if available
  let solutionElement = null;
  if (parsonsWidget.options?.sortableId) {
    solutionElement = typeof parsonsWidget.options.sortableId === 'string'
      ? document.getElementById(parsonsWidget.options.sortableId)
      : parsonsWidget.options.sortableId;
  }
  if (!solutionElement && typeof document !== 'undefined') {
    solutionElement = document.getElementById('solution-sortable');
  }

  let trashElement = null;
  if (parsonsWidget.options?.trashId) {
    trashElement = typeof parsonsWidget.options.trashId === 'string'
      ? document.getElementById(parsonsWidget.options.trashId)
      : parsonsWidget.options.trashId;
  }
  if (!trashElement && typeof document !== 'undefined') {
    trashElement = document.getElementById('source-sortable');
  }

  const solutionUl = solutionElement ? (solutionElement.tagName === 'UL' ? solutionElement : solutionElement.querySelector('ul')) : null;
  const trashUl = trashElement ? (trashElement.tagName === 'UL' ? trashElement : trashElement.querySelector('ul')) : null;

  const lineMap = new Map();
  allLines.forEach((l) => {
    if (l && l.id) {
      lineMap.set(l.id, l);
    }
  });

  const solutionLines = [];
  const distractorLines = [];
  const processedIds = new Set();

  if (solutionUl && solutionUl.children.length > 0) {
    Array.from(solutionUl.children).forEach((li) => {
      const line = lineMap.get(li.id);
      if (line) {
        solutionLines.push(line);
        processedIds.add(li.id);
      }
    });
  }

  if (trashUl && trashUl.children.length > 0) {
    Array.from(trashUl.children).forEach((li) => {
      const line = lineMap.get(li.id);
      if (line) {
        distractorLines.push(line);
        processedIds.add(li.id);
      }
    });
  }

  // Add any remaining lines that weren't found in either UL
  allLines.forEach((line) => {
    if (line && line.id && !processedIds.has(line.id)) {
      if (!solutionUl) {
        solutionLines.push(line);
      } else {
        distractorLines.push(line);
      }
      processedIds.add(line.id);
    }
  });

  const formattedSolution = solutionLines.map((line) => {
    const lineText = normalizeSourceCode(line.code || '').trimEnd();
    if (!lineText) {
      return '';
    }

    const indent = typeof line.indent === 'number' && line.indent >= 0 ? line.indent : 0;
    let reprLine = `${lineText} #${indent}given`;
    const blankValues = typeof getLineInputValues === 'function' ? getLineInputValues(line.id) : [];
    if (blankValues.length) {
      reprLine += blankValues.map((value) => ` #blank${value}`).join('');
    }
    if (line.studentGiven) {
      reprLine += ' #preplace';
    }
    return reprLine;
  }).filter(Boolean);

  const formattedDistractors = distractorLines.map((line) => {
    const lineText = normalizeSourceCode(line.code || '').trimEnd();
    if (!lineText) {
      return '';
    }
    return lineText;
  }).filter(Boolean);

  return [...formattedSolution, ...formattedDistractors].join('\n');
}

export function renderParsonsBoard(initialText, options) {
  const {
    sourceSortable,
    solutionSortable,
    ParsonsWidgetCtor,
    onSortableUpdate,
    injectDeleteButtons,
    injectGivenToggles,
    updateCounters
  } = options;

  if (!sourceSortable || !solutionSortable || !ParsonsWidgetCtor) {
    return null;
  }

  sourceSortable.innerHTML = '';
  solutionSortable.innerHTML = '';

  const parsonsWidget = new ParsonsWidgetCtor({
    sortableId: solutionSortable,
    trashId: sourceSortable,
    containment: sourceSortable.closest('.card-body'),
    trash_label: 'Drag from here',
    solution_label: 'Solution &mdash; drag blocks here, double click to pin',
    onSortableUpdate: () => {
      if (onSortableUpdate) {
        onSortableUpdate();
      }
    },
  });

  parsonsWidget.init(initialText);

  const solutionIds = parsonsWidget.given.map((line) => line.id);
  const solutionSet = new Set(solutionIds);
  const sourceIds = parsonsWidget.modified_lines
    .filter((line) => !solutionSet.has(line.id))
    .map((line) => line.id);

  parsonsWidget.createHTMLFromLists(solutionIds, sourceIds);
  parsonsWidget.setLineNumbers();
  
  if (injectDeleteButtons) {
    injectDeleteButtons(sourceSortable);
    injectDeleteButtons(solutionSortable);
  }
  if (injectGivenToggles) {
    injectGivenToggles(solutionSortable);
  }
  if (updateCounters) {
    updateCounters();
  }
  
  return parsonsWidget;
}

export function parseCustomErrorRules(rawRules) {
  if (!rawRules) {
    return [];
  }

  let parsed = rawRules;
  if (typeof rawRules === 'string') {
    try {
      parsed = JSON.parse(rawRules);
    } catch (e) {
      console.warn('Failed to parse custom error rules JSON:', e);
      return [];
    }
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter((rule) => {
    if (!rule || typeof rule !== 'object') {
      return false;
    }
    const pattern = typeof rule.pattern === 'string' ? rule.pattern.trim() : '';
    const message = typeof rule.message === 'string' ? rule.message.trim() : '';
    return Boolean(pattern && message);
  });
}
