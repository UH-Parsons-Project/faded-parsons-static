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

export function buildCustomRepr(parsonsWidget, normalizeSourceCode, getLineInputValues) {
  if (!parsonsWidget) {
    return '';
  }
  const lines = Array.isArray(parsonsWidget.modified_lines) ? parsonsWidget.modified_lines : [];
  if (!lines.length) {
    return '';
  }

  return lines.map((line) => {
    const lineText = normalizeSourceCode(line.code || '').trimEnd();
    if (!lineText) {
      return '';
    }

    let reprLine = `${lineText} #${line.indent}given`;
    const blankValues = getLineInputValues(line.id);
    if (blankValues.length) {
      reprLine += blankValues.map((value) => ` #blank${value}`).join('');
    }
    if (line.studentGiven) {
      reprLine += ' #preplace';
    }
    return reprLine;
  }).filter(Boolean).join('\n');
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
