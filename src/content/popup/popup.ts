import { allMajorDataSeries, MajorDataSeries } from '@birchill/hikibiki-data';

import {
  AccentDisplay,
  ContentConfig,
  PartOfSpeechDisplay,
} from '../../common/content-config';
import { CopyType } from '../../common/copy-keys';
import { ReferenceAbbreviation } from '../../common/refs';
import { probablyHasPhysicalKeyboard } from '../../utils/device';
import { HTML_NS } from '../../utils/dom-utils';
import { getThemeClass } from '../../utils/themes';

import {
  getOrCreateEmptyContainer,
  removeContentContainer,
} from '../content-container';
import { SelectionMeta } from '../meta';
import { QueryResult } from '../query';

import { html } from './builder';
import { renderCloseButton } from './close';
import { renderCopyOverlay } from './copy-overlay';
import { CopyState } from './copy-state';
import { renderKanjiEntry } from './kanji';
import { renderMetadata } from './metadata';
import { renderNamesEntries } from './names';
import {
  renderCopyDetails,
  renderSwitchDictionaryHint,
  renderUpdatingStatus,
} from './status';
import { renderTabBar } from './tabs';
import { renderWordEntries } from './words';

import popupStyles from '../../../css/popup.css';

export interface PopupOptions {
  accentDisplay: AccentDisplay;
  container?: HTMLElement;
  copyNextKey: string;
  copyState: CopyState;
  dictToShow: MajorDataSeries;
  dictLang?: string;
  document?: Document;
  fxData: ContentConfig['fx'];
  hasSwitchedDictionary?: boolean;
  kanjiReferences: Array<ReferenceAbbreviation>;
  meta?: SelectionMeta;
  onCancelCopy?: () => void;
  onStartCopy?: (index: number) => void;
  onCopy?: (copyType: CopyType) => void;
  onClosePopup?: () => void;
  onShowSettings?: () => void;
  onSwitchDictionary?: (newDict: MajorDataSeries) => void;
  posDisplay: PartOfSpeechDisplay;
  popupStyle: string;
  showDefinitions: boolean;
  showPriority: boolean;
  showKanjiComponents?: boolean;
  switchDictionaryKeys: ReadonlyArray<string>;
  tabDisplay: 'top' | 'left' | 'right' | 'none';
  touchMode?: boolean;
}

export function renderPopup(
  result: QueryResult | undefined,
  options: PopupOptions
): HTMLElement | null {
  const doc = options.document || document;
  const container = options.container || getDefaultContainer(doc);
  const touchMode = !!options.touchMode;
  const windowElem = resetContainer({
    container,
    document: doc,
    popupStyle: options.popupStyle,
    touchMode,
  });

  // TODO: We should use `options.document` everywhere in this file and in
  // the other methods too.

  const hasResult = result && (result.words || result.kanji || result.names);
  const showTabs =
    hasResult &&
    result.resultType !== 'db-unavailable' &&
    !result.title &&
    options.tabDisplay !== 'none';
  if (showTabs) {
    windowElem.append(
      renderTabBar({
        onClosePopup: options.onClosePopup,
        onShowSettings: options.onShowSettings,
        onSwitchDictionary: options.onSwitchDictionary,
        queryResult: result,
        selectedTab: options.dictToShow,
      })
    );

    windowElem.dataset.tabSide = options.tabDisplay || 'top';
  }

  const contentContainer = html('div', { class: 'content' });

  const resultToShow = result?.[options.dictToShow];

  switch (resultToShow?.type) {
    case 'kanji':
      contentContainer.append(
        renderKanjiEntry({ entry: resultToShow.data, options })
      );
      break;

    case 'names':
      contentContainer.append(
        renderNamesEntries({
          entries: resultToShow.data,
          more: resultToShow.more,
          options,
        })
      );
      break;

    case 'words':
      {
        contentContainer.append(
          renderWordEntries({
            entries: resultToShow.data,
            matchLen: resultToShow.matchLen,
            more: resultToShow.more,
            namePreview: result!.namePreview,
            options,
            title: result!.title,
          })
        );
      }
      break;

    default:
      {
        if (!options.meta) {
          return null;
        }

        const metadata = renderMetadata({
          fxData: options.fxData,
          isCombinedResult: false,
          matchLen: 0,
          meta: options.meta,
        });
        if (!metadata) {
          return null;
        }
        metadata.classList.add('-metaonly');

        contentContainer.append(
          html('div', { class: 'wordlist entry-data' }, metadata)
        );
      }
      break;
  }

  // Render the copy overlay if needed
  if (showOverlay(options.copyState)) {
    contentContainer.append(
      html(
        'div',
        { class: 'grid-stack' },
        // Dictionary content
        contentContainer.lastElementChild as HTMLElement,
        renderCopyOverlay({
          copyState: options.copyState,
          kanjiReferences: options.kanjiReferences,
          onCancelCopy: options.onCancelCopy,
          onCopy: options.onCopy,
          result: resultToShow || undefined,
          showKanjiComponents: options.showKanjiComponents,
        })
      )
    );

    // Set the overlay styles for the window, but wait a moment so we can
    // transition the styles in.
    requestAnimationFrame(() => windowElem.classList.add('-has-overlay'));
  }

  // Set copy styles
  switch (options.copyState.kind) {
    case 'active':
      windowElem.classList.add('-copy-active');
      break;

    case 'error':
      windowElem.classList.add('-copy-error');
      break;

    case 'finished':
      windowElem.classList.add('-copy-finished');
      break;
  }

  // Generate status bar contents
  const copyDetails = renderCopyDetails({
    copyNextKey: options.copyNextKey,
    copyState: options.copyState,
    series: resultToShow?.type || 'words',
  });
  const numResultsAvailable = allMajorDataSeries.filter(
    (series) => !!result?.[series]
  ).length;

  let statusBar: HTMLElement | null = null;
  if (copyDetails) {
    statusBar = copyDetails;
  } else if (hasResult && result?.resultType === 'db-updating') {
    statusBar = renderUpdatingStatus();
  } else if (
    showTabs &&
    numResultsAvailable > 1 &&
    options.hasSwitchedDictionary === false &&
    options.switchDictionaryKeys.length &&
    probablyHasPhysicalKeyboard()
  ) {
    statusBar = renderSwitchDictionaryHint(options.switchDictionaryKeys);
  }

  let contentWrapper = contentContainer;
  if (statusBar) {
    contentWrapper = html(
      'div',
      { class: 'status-bar-wrapper' },
      contentContainer,
      statusBar
    );
  }

  if (!showTabs && options.onClosePopup) {
    windowElem.append(
      html(
        'div',
        { class: 'close-button-wrapper' },
        contentWrapper,
        renderCloseButton(options.onClosePopup)
      )
    );
  } else {
    windowElem.append(contentWrapper);
  }

  return container;
}

function getDefaultContainer(doc: Document): HTMLElement {
  return getOrCreateEmptyContainer({
    doc,
    id: 'tenten-ja-window',
    legacyIds: ['rikaichamp-window'],
    styles: popupStyles.toString(),
  });
}

function resetContainer({
  container,
  document: doc,
  popupStyle,
  touchMode,
}: {
  container: HTMLElement;
  document: Document;
  popupStyle: string;
  touchMode: boolean;
}): HTMLElement {
  const windowDiv = doc.createElementNS(HTML_NS, 'div');
  windowDiv.classList.add('window');

  // Set theme
  windowDiv.classList.add(getThemeClass(popupStyle));

  // Set touch status
  if (touchMode) {
    windowDiv.classList.add('touch');
  }

  if (container.shadowRoot) {
    container.shadowRoot.append(windowDiv);
  } else {
    container.append(windowDiv);
  }

  // Reset the container position and size so that we can consistently measure
  // the size of the popup.
  container.style.removeProperty('left');
  container.style.removeProperty('top');
  container.style.removeProperty('max-width');
  container.style.removeProperty('max-height');

  return windowDiv;
}

export function isPopupVisible(): boolean {
  const popupWindow = getPopupWindow();
  return !!popupWindow && !popupWindow.classList.contains('hidden');
}

export function hidePopup() {
  getPopupWindow()?.classList.add('hidden');
}

export function removePopup() {
  removeContentContainer(['rikaichamp-window', 'tenten-ja-window']);
}

export function setPopupStyle(style: string) {
  const windowElem = getPopupWindow();
  if (!windowElem) {
    return;
  }

  for (const className of windowElem.classList.values()) {
    if (className.startsWith('theme-')) {
      windowElem.classList.remove(className);
    }
  }

  windowElem.classList.add(getThemeClass(style));
}

function getPopupWindow(): HTMLElement | null {
  const contentContainer = document.getElementById('tenten-ja-window');
  return contentContainer && contentContainer.shadowRoot
    ? contentContainer.shadowRoot.querySelector('.window')
    : null;
}

export function isPopupWindow(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.id === 'tenten-ja-window';
}

export function showOverlay(copyState: CopyState): boolean {
  return (
    (copyState.kind === 'active' || copyState.kind === 'error') &&
    copyState.mode === 'overlay'
  );
}
