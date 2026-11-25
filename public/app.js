/**
 * stylesdays pSEO Static Site Generator & Management Dashboard SPA Client
 */
(function () {
  'use strict';

  // State Management
  const state = {
    config: {},
    status: {},
    posts: [],
    selectedPostSlug: null,
    previewDebounceTimer: null,
    logPollInterval: null,
    activePlatform: 'cloudflare',
    activeTab: 'tab-ingest',
    projects: [],
    activeProject: 'stylesdays',
    isIngesting: false,
    isDeploying: false,
    deployPollInterval: null,
    ingestPollInterval: null,
    allCategories: [],
    allCategoriesProject: null,
    editorMode: 'visual',
    rteSavedRange: null,
    rteInlineAction: null,
    themeCustomDraft: { content_blocks: [] },
    themeEditorDebounceTimer: null,
    themeEditorDirty: false,
    // Multi-user Auth & Separated Space State (strictly in-memory; never localStorage/sessionStorage)
    authToken: '',
    currentUser: null,
    activeSpaceId: '',
    viewingSpaceOwner: null,
    authStatus: null,
    adminUsers: [],
    adminSettings: { allow_self_signup: true },
  };

  const State = state; // Safe alias preventing ReferenceError: State is not defined

  // DOM Elements
  const DOM = {
    panes: document.querySelectorAll('.tab-pane'),
    selectedPlatformBadge: document.getElementById('selectedPlatformBadge'),
    selectedPlatformIcon: document.getElementById('selectedPlatformIcon'),
    selectedPlatformText: document.getElementById('selectedPlatformText'),
    selectActiveProject: document.getElementById('selectActiveProject'),
    btnNewProject: document.getElementById('btnNewProject'),
    modalNewProject: document.getElementById('modalNewProject'),
    btnCloseNewProjectModal: document.getElementById('btnCloseNewProjectModal'),
    btnCancelNewProject: document.getElementById('btnCancelNewProject'),
    newProjectForm: document.getElementById('newProjectForm'),
    newProjName: document.getElementById('newProjName'),
    newProjPlatform: document.getElementById('newProjPlatform'),
    newProjCfWorker: document.getElementById('newProjCfWorker'),
    newProjCfDomain: document.getElementById('newProjCfDomain'),
    newProjGhOwner: document.getElementById('newProjGhOwner'),
    newProjGhRepo: document.getElementById('newProjGhRepo'),
    newProjSitemapUrl: document.getElementById('newProjSitemapUrl'),
    cfgStep1GithubOwner: document.getElementById('cfgStep1GithubOwner'),
    cfgStep1GithubRepo: document.getElementById('cfgStep1GithubRepo'),
    cfgStep1GithubAccount: document.getElementById('cfgStep1GithubAccount'),
    btnRefreshStep1Orgs: document.getElementById('btnRefreshStep1Orgs'),
    cfgStep1AutoRootOrg: document.getElementById('cfgStep1AutoRootOrg'),
    btnStep1CheckOrg: document.getElementById('btnStep1CheckOrg'),
    btnStep1CreateRepo: document.getElementById('btnStep1CreateRepo'),
    linkStep1OpenGithubOrg: document.getElementById('linkStep1OpenGithubOrg'),
    step1RootDomainPreview: document.getElementById('step1RootDomainPreview'),
    step1OrgStatusFeedback: document.getElementById('step1OrgStatusFeedback'),
    step1GithubTokenDetectedBadge: document.getElementById('step1GithubTokenDetectedBadge'),
    step1TargetCadreCf: document.getElementById('step1TargetCadreCf'),
    step1TargetCadreGh: document.getElementById('step1TargetCadreGh'),
    step1ActivePlatformTitle: document.getElementById('step1ActivePlatformTitle'),
    newProjGhOwnerSelect: document.getElementById('newProjGhOwnerSelect'),
    btnVerifyGhToken: document.getElementById('btnVerifyGhToken'),

    // Stats
    statTotalPosts: document.getElementById('statTotalPosts'),
    statProjectAssets: document.getElementById('statProjectAssets'),
    statNewPosts: document.getElementById('statNewPosts'),
    statCustomPosts: document.getElementById('statCustomPosts'),
    statTheme: document.getElementById('statTheme'),

    // Cloudflare Settings
    cloudflareSettingsForm: document.getElementById('cloudflareSettingsForm'),
    cfgCfToken: document.getElementById('cfgCfToken'),
    cfTokenStatusBadge: document.getElementById('cfTokenStatusBadge'),
    toggleCfTokenEye: document.getElementById('toggleCfTokenEye'),
    toggleGhTokenEye: document.getElementById('toggleGhTokenEye'),
    cfgCfAccountId: document.getElementById('cfgCfAccountId'),
    cfgCfAccountSubdomain: document.getElementById('cfgCfAccountSubdomain'),
    cfgCfProjectName: document.getElementById('cfgCfProjectName'),
    cfgCfDeployType: document.getElementById('cfgCfDeployType'),
    cfgCfCustomDomain: document.getElementById('cfgCfCustomDomain'),
    cfgCfCompatibilityDate: document.getElementById('cfgCfCompatibilityDate'),
    btnVerifyCfToken: document.getElementById('btnVerifyCfToken'),
    cfStatusFeedback: document.getElementById('cfStatusFeedback'),
    optimizeWebpBtn: document.getElementById('optimizeWebpBtn'),
    syncAssetsSettingsBtn: document.getElementById('syncAssetsSettingsBtn'),
    quickDeployThemeSelect: document.getElementById('quickDeployThemeSelect'),

    // Settings (GitHub)
    settingsForm: document.getElementById('settingsForm'),
    cfgGithubToken: document.getElementById('cfgGithubToken'),
    tokenStatusBadge: document.getElementById('tokenStatusBadge'),
    cfgGithubBranch: document.getElementById('cfgGithubBranch'),
    cfgGithubBasePath: document.getElementById('cfgGithubBasePath'),
    ghStatusFeedback: document.getElementById('ghStatusFeedback'),
    buildOptionsForm: document.getElementById('buildOptionsForm'),
    cfgTheme: document.getElementById('cfgTheme'),
    cfgRoutingMode: document.getElementById('cfgRoutingMode'),
    cfgOutputDir: document.getElementById('cfgOutputDir'),
    cfgWpApiUrl: document.getElementById('cfgWpApiUrl'),
    cfgBrandName: document.getElementById('cfgBrandName'),
    cfgBrandTagline: document.getElementById('cfgBrandTagline'),
    cfgAuthorName: document.getElementById('cfgAuthorName'),
    cfgAuthorBio: document.getElementById('cfgAuthorBio'),
    cfgSocialPinterest: document.getElementById('cfgSocialPinterest'),
    cfgSocialFacebook: document.getElementById('cfgSocialFacebook'),
    cfgSocialInstagram: document.getElementById('cfgSocialInstagram'),
    cfgSocialTwitter: document.getElementById('cfgSocialTwitter'),
    cfgSocialTiktok: document.getElementById('cfgSocialTiktok'),
    cfgSocialYoutube: document.getElementById('cfgSocialYoutube'),
    cfgCustomHeadCode: document.getElementById('cfgCustomHeadCode'),
    btnSaveHeadCode: document.getElementById('btnSaveHeadCode'),
    btnClearHeadCode: document.getElementById('btnClearHeadCode'),
    headCodeMetrics: document.getElementById('headCodeMetrics'),
    headCodeStatusTag: document.getElementById('headCodeStatusTag'),
    headOutputPreview: document.getElementById('headOutputPreview'),
    headOutputVerifyBadge: document.getElementById('headOutputVerifyBadge'),
    quickLogoPreviewBox: document.getElementById('quickLogoPreviewBox'),
    quickLogoStatusBadge: document.getElementById('quickLogoStatusBadge'),
    quickBrandNameDisplay: document.getElementById('quickBrandNameDisplay'),
    quickTaglineDisplay: document.getElementById('quickTaglineDisplay'),
    quickLogoFileInput: document.getElementById('quickLogoFileInput'),
    quickBtnCropLogo: document.getElementById('quickBtnCropLogo'),
    quickBtnResetLogo: document.getElementById('quickBtnResetLogo'),
    previewLogoBox: document.getElementById('previewLogoBox'),
    previewBrandNameDisplay: document.getElementById('previewBrandNameDisplay'),
    previewLogoFileInput: document.getElementById('previewLogoFileInput'),
    cfgEnableToc: document.getElementById('cfgEnableToc'),
    cfgEnableFaq: document.getElementById('cfgEnableFaq'),
    cfgEnableEeat: document.getElementById('cfgEnableEeat'),

    // Ingestion
    ingestionForm: document.getElementById('ingestionForm'),
    ingestSourceType: document.getElementById('ingestSourceType'),
    groupSitemapUrl: document.getElementById('groupSitemapUrl'),
    ingestUrlLabel: document.getElementById('ingestUrlLabel'),
    groupUrlList: document.getElementById('groupUrlList'),
    ingestSitemapUrl: document.getElementById('ingestSitemapUrl'),
    ingestUrlList: document.getElementById('ingestUrlList'),
    ingestMaxPosts: document.getElementById('ingestMaxPosts'),
    ingestDownloadImages: document.getElementById('ingestDownloadImages'),
    ingestForceResync: document.getElementById('ingestForceResync'),
    scanSitemapBtn: document.getElementById('scanSitemapBtn'),
    startIngestBtn: document.getElementById('startIngestBtn'),
    ingestProgressBarContainer: document.getElementById('ingestProgressBarContainer'),
    ingestProgressLabel: document.getElementById('ingestProgressLabel'),
    ingestProgressCount: document.getElementById('ingestProgressCount'),
    ingestProgressBar: document.getElementById('ingestProgressBar'),
    btnStep1Next: document.getElementById('btnStep1Next'),
    syncAssetsBtn: document.getElementById('syncAssetsBtn'),
    stopIngestBtn: document.getElementById('stopIngestBtn'),
    clearProjectBtn: document.getElementById('clearProjectBtn'),
    scanResultBanner: document.getElementById('scanResultBanner'),
    clearProjectConfirmBar: document.getElementById('clearProjectConfirmBar'),
    btnConfirmClearProject: document.getElementById('btnConfirmClearProject'),
    btnCancelClearProject: document.getElementById('btnCancelClearProject'),
    syncAssetsDeployBtn: document.getElementById('syncAssetsDeployBtn'),
    diffResultsBox: document.getElementById('diffResultsBox'),
    diffNewCount: document.getElementById('diffNewCount'),
    diffUpdatedCount: document.getElementById('diffUpdatedCount'),
    diffSyncedCount: document.getElementById('diffSyncedCount'),
    diffSummaryTableBody: document.querySelector('#diffSummaryTable tbody'),

    // Posts Catalog
    postsCatalogBody: document.getElementById('postsCatalogBody'),
    postSearchInput: document.getElementById('postSearchInput'),
    postCategoryFilter: document.getElementById('postCategoryFilter'),
    postStatusFilter: document.getElementById('postStatusFilter'),
    catalogCategoryPills: document.getElementById('catalogCategoryPills'),
    fetchWorkerPostsBtn: document.getElementById('fetchWorkerPostsBtn'),
    catalogWorkerStatus: document.getElementById('catalogWorkerStatus'),
    catalogPostsCountTag: document.getElementById('catalogPostsCountTag'),
    catalogPagesStatusTag: document.getElementById('catalogPagesStatusTag'),
    staticPagesBody: document.getElementById('staticPagesBody'),
    staticPageQuickFileInput: document.getElementById('staticPageQuickFileInput'),
    staticPagesDeployStatus: document.getElementById('staticPagesDeployStatus'),
    btnDeployAllPagesCf: document.getElementById('btnDeployAllPagesCf'),
    btnDeployAllPagesGh: document.getElementById('btnDeployAllPagesGh'),

    // Static Page Editor Modal
    staticPageEditModal: document.getElementById('staticPageEditModal'),
    modalStaticPageTitle: document.getElementById('modalStaticPageTitle'),
    modalStaticPageRoute: document.getElementById('modalStaticPageRoute'),
    modalStaticPageStatusBadge: document.getElementById('modalStaticPageStatusBadge'),
    closeStaticPageModalBtn: document.getElementById('closeStaticPageModalBtn'),
    cancelStaticPageModalBtn: document.getElementById('cancelStaticPageModalBtn'),
    editStaticPageForm: document.getElementById('editStaticPageForm'),
    editStaticPageSlug: document.getElementById('editStaticPageSlug'),
    editStaticPageTitle: document.getElementById('editStaticPageTitle'),
    editStaticPageDescription: document.getElementById('editStaticPageDescription'),
    modalStaticPageFileInput: document.getElementById('modalStaticPageFileInput'),
    btnResetStaticPageDefault: document.getElementById('btnResetStaticPageDefault'),
    staticPageWordCount: document.getElementById('staticPageWordCount'),
    btnStaticPageVisual: document.getElementById('btnStaticPageVisual'),
    btnStaticPageSource: document.getElementById('btnStaticPageSource'),
    btnStaticPagePreview: document.getElementById('btnStaticPagePreview'),
    staticPageRteToolbar: document.getElementById('staticPageRteToolbar'),
    editStaticPageRichEditor: document.getElementById('editStaticPageRichEditor'),
    editStaticPageHtmlSource: document.getElementById('editStaticPageHtmlSource'),
    editStaticPagePreviewIframe: document.getElementById('editStaticPagePreviewIframe'),
    editStaticPageDeployStatus: document.getElementById('editStaticPageDeployStatus'),
    saveStaticPageBtn: document.getElementById('saveStaticPageBtn'),
    btnSaveDeployStaticPageCf: document.getElementById('btnSaveDeployStaticPageCf'),
    btnSaveDeployStaticPageGh: document.getElementById('btnSaveDeployStaticPageGh'),

    // Modal Editor
    postEditModal: document.getElementById('postEditModal'),
    modalPostSlugTitle: document.getElementById('modalPostSlugTitle'),
    modalPostCatBadge: document.getElementById('modalPostCatBadge'),
    editPostForm: document.getElementById('editPostForm'),
    editPostSlug: document.getElementById('editPostSlug'),
    editPostTitle: document.getElementById('editPostTitle'),
    editPostExcerpt: document.getElementById('editPostExcerpt'),
    editPostCategory: document.getElementById('editPostCategory'),
    editPostParentSlug: document.getElementById('editPostParentSlug'),
    editPostRichEditor: document.getElementById('editPostRichEditor'),
    editPostHtmlSource: document.getElementById('editPostHtmlSource'),
    rteToolbar: document.getElementById('rteToolbar'),
    btnEditorVisual: document.getElementById('btnEditorVisual'),
    btnEditorSource: document.getElementById('btnEditorSource'),
    editorWordCount: document.getElementById('editorWordCount'),
    btnRteLink: document.getElementById('btnRteLink'),
    btnRteImage: document.getElementById('btnRteImage'),
    rteInlineBar: document.getElementById('rteInlineBar'),
    rteInlineLabel: document.getElementById('rteInlineLabel'),
    rteInlineUrl: document.getElementById('rteInlineUrl'),
    rteInlineText: document.getElementById('rteInlineText'),
    btnRteInlineApply: document.getElementById('btnRteInlineApply'),
    btnRteInlineCancel: document.getElementById('btnRteInlineCancel'),
    saveAndPreviewBtn: document.getElementById('saveAndPreviewBtn'),
    savePostBtn: document.getElementById('savePostBtn'),
    saveAndDeployPostBtn: document.getElementById('saveAndDeployPostBtn'),
    editPostDeployStatus: document.getElementById('editPostDeployStatus'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    cancelEditBtn: document.getElementById('cancelEditBtn'),

    // Preview
    previewPostSelect: document.getElementById('previewPostSelect'),
    previewThemeSelect: document.getElementById('previewThemeSelect'),
    previewRoutingSelect: document.getElementById('previewRoutingSelect'),
    previewLiveTitle: document.getElementById('previewLiveTitle'),
    refreshPreviewBtn: document.getElementById('refreshPreviewBtn'),
    previewIframe: document.getElementById('previewIframe'),
    viewportBtns: document.querySelectorAll('.viewport-btn'),

    // Theme & Routing Visual Gallery
    btnOpenThemePreview: document.getElementById('btnOpenThemePreview'),
    templatePreviewModal: document.getElementById('templatePreviewModal'),
    templateModalWorkspace: document.getElementById('templateModalWorkspace'),
    themeEditorSidebar: document.getElementById('themeEditorSidebar'),
    toggleThemeEditorBtn: document.getElementById('toggleThemeEditorBtn'),
    closeTemplateModalBtn: document.getElementById('closeTemplateModalBtn'),
    templateModalIframe: document.getElementById('templateModalIframe'),
    templateModalThemeBadge: document.getElementById('templateModalThemeBadge'),
    templateModalRoutingBadge: document.getElementById('templateModalRoutingBadge'),
    applyTemplateThemeBtn: document.getElementById('applyTemplateThemeBtn'),
    themeEdLiveStatus: document.getElementById('themeEdLiveStatus'),
    btnResetThemeEdits: document.getElementById('btnResetThemeEdits'),
    teHeroTitle: document.getElementById('teHeroTitle'),
    teHeroSubtitle: document.getElementById('teHeroSubtitle'),
    teCategoriesTitle: document.getElementById('teCategoriesTitle'),
    teLatestTitle: document.getElementById('teLatestTitle'),
    teNewsletterTitle: document.getElementById('teNewsletterTitle'),
    teNewsletterCopy: document.getElementById('teNewsletterCopy'),
    teFooterDesc: document.getElementById('teFooterDesc'),
    teFooterCopyright: document.getElementById('teFooterCopyright'),
    teFooterEmail: document.getElementById('teFooterEmail'),
    btnAddThemeBlock: document.getElementById('btnAddThemeBlock'),
    themeBlocksList: document.getElementById('themeBlocksList'),
    themeBlocksCount: document.getElementById('themeBlocksCount'),

    // Build & Deploy Cockpit
    triggerBuildBtn: document.getElementById('triggerBuildBtn'),
    triggerDeployBtn: document.getElementById('triggerDeployBtn'),
    deployDryRun: document.getElementById('deployDryRun'),
    triggerCfDeployBtn: document.getElementById('triggerCfDeployBtn'),
    deployProgressBarContainer: document.getElementById('deployProgressBarContainer'),
    deployProgressLabel: document.getElementById('deployProgressLabel'),
    deployProgressPercent: document.getElementById('deployProgressPercent'),
    deployProgressBar: document.getElementById('deployProgressBar'),
    buildProgressBarContainer: document.getElementById('buildProgressBarContainer'),
    buildProgressLabel: document.getElementById('buildProgressLabel'),
    buildProgressPercent: document.getElementById('buildProgressPercent'),
    buildProgressBar: document.getElementById('buildProgressBar'),
    ghBuildProgressBarContainer: document.getElementById('ghBuildProgressBarContainer'),
    ghBuildProgressLabel: document.getElementById('ghBuildProgressLabel'),
    ghBuildProgressPercent: document.getElementById('ghBuildProgressPercent'),
    ghBuildProgressBar: document.getElementById('ghBuildProgressBar'),
    ghDeployProgressBarContainer: document.getElementById('ghDeployProgressBarContainer'),
    ghDeployProgressLabel: document.getElementById('ghDeployProgressLabel'),
    ghDeployProgressPercent: document.getElementById('ghDeployProgressPercent'),
    ghDeployProgressBar: document.getElementById('ghDeployProgressBar'),
    deployCfDryRun: document.getElementById('deployCfDryRun'),
    copyLogsBtn: document.getElementById('copyLogsBtn'),
    termFilterBtns: document.querySelectorAll('.term-filter-btn'),
    terminalBody: document.getElementById('terminalBody'),
    clearLogsBtn: document.getElementById('clearLogsBtn'),

    // Platform Division & Stepper Elements
    toggleTerminalSizeBtn: document.getElementById('toggleTerminalSizeBtn'),
    terminalSection: document.getElementById('terminalSection'),

    // Platform Settings Modal Elements
    btnOpenSettings: document.getElementById('btnOpenSettings'),
    btnCloseSettingsModal: document.getElementById('btnCloseSettingsModal'),
    platformSettingsModal: document.getElementById('platformSettingsModal'),
    modalTabBtnCf: document.getElementById('modalTabBtnCf'),
    modalTabBtnGh: document.getElementById('modalTabBtnGh'),
    settingsPaneCf: document.getElementById('settingsPaneCf'),
    settingsPaneGh: document.getElementById('settingsPaneGh'),
    stepCardIngest: document.getElementById('stepCardIngest'),
    stepCardThemes: document.getElementById('stepCardThemes'),
    stepCardPosts: document.getElementById('stepCardPosts'),
    stepCardDeploy: document.getElementById('stepCardDeploy'),
    statTargetUrl: document.getElementById('statTargetUrl'),
    statPlatformCard: document.getElementById('statPlatformCard'),
    triggerBuildGhBtn: document.getElementById('triggerBuildGhBtn'),

    // Dedicated Platform Workspaces
    workspaceCloudflare: document.getElementById('workspaceCloudflare'),
    workspaceGithub: document.getElementById('workspaceGithub'),
    toastContainer: document.getElementById('toastContainer'),

    // Multi-User Auth Gate & Header User Controls
    currentUserBadge: document.getElementById('currentUserBadge'),
    currentUserRoleTag: document.getElementById('currentUserRoleTag'),
    currentUserNameLabel: document.getElementById('currentUserNameLabel'),
    btnOpenAdminConsole: document.getElementById('btnOpenAdminConsole'),
    btnSignOut: document.getElementById('btnSignOut'),
    adminSpaceBanner: document.getElementById('adminSpaceBanner'),
    adminViewingOwnerName: document.getElementById('adminViewingOwnerName'),
    adminViewingSpaceId: document.getElementById('adminViewingSpaceId'),
    btnOpenAdminFromBanner: document.getElementById('btnOpenAdminFromBanner'),
    btnReturnOwnSpace: document.getElementById('btnReturnOwnSpace'),

    authGateOverlay: document.getElementById('authGateOverlay'),
    authGateSubtitle: document.getElementById('authGateSubtitle'),
    authModeTabs: document.getElementById('authModeTabs'),
    authTabLoginBtn: document.getElementById('authTabLoginBtn'),
    authTabRegisterBtn: document.getElementById('authTabRegisterBtn'),
    authFeedbackBox: document.getElementById('authFeedbackBox'),
    authSetupAdminForm: document.getElementById('authSetupAdminForm'),
    setupAdminUsername: document.getElementById('setupAdminUsername'),
    setupAdminDisplayName: document.getElementById('setupAdminDisplayName'),
    setupAdminEmail: document.getElementById('setupAdminEmail'),
    setupAdminPassword: document.getElementById('setupAdminPassword'),
    setupAdminConfirm: document.getElementById('setupAdminConfirm'),
    btnSubmitSetupAdmin: document.getElementById('btnSubmitSetupAdmin'),
    authLoginForm: document.getElementById('authLoginForm'),
    loginIdentifier: document.getElementById('loginIdentifier'),
    loginPassword: document.getElementById('loginPassword'),
    btnSubmitLogin: document.getElementById('btnSubmitLogin'),
    authRegisterForm: document.getElementById('authRegisterForm'),
    regUsername: document.getElementById('regUsername'),
    regDisplayName: document.getElementById('regDisplayName'),
    regEmail: document.getElementById('regEmail'),
    regPassword: document.getElementById('regPassword'),
    regConfirm: document.getElementById('regConfirm'),
    btnSubmitRegister: document.getElementById('btnSubmitRegister'),
    authSignupDisabledNote: document.getElementById('authSignupDisabledNote'),

    // System Admin Console Modal
    adminConsoleModal: document.getElementById('adminConsoleModal'),
    btnCloseAdminConsole: document.getElementById('btnCloseAdminConsole'),
    adminMetricTotalUsers: document.getElementById('adminMetricTotalUsers'),
    adminMetricActiveAdmins: document.getElementById('adminMetricActiveAdmins'),
    adminMetricTotalSpaces: document.getElementById('adminMetricTotalSpaces'),
    adminToggleSelfSignup: document.getElementById('adminToggleSelfSignup'),
    btnAdminRefreshUsers: document.getElementById('btnAdminRefreshUsers'),
    btnToggleAdminCreateForm: document.getElementById('btnToggleAdminCreateForm'),
    adminCreateUserForm: document.getElementById('adminCreateUserForm'),
    adminNewUsername: document.getElementById('adminNewUsername'),
    adminNewEmail: document.getElementById('adminNewEmail'),
    adminNewDisplayName: document.getElementById('adminNewDisplayName'),
    adminNewPassword: document.getElementById('adminNewPassword'),
    adminNewRole: document.getElementById('adminNewRole'),
    btnCancelAdminCreate: document.getElementById('btnCancelAdminCreate'),
    btnSubmitAdminCreate: document.getElementById('btnSubmitAdminCreate'),
    adminResetPasswordForm: document.getElementById('adminResetPasswordForm'),
    adminResetUserId: document.getElementById('adminResetUserId'),
    adminResetUserLabel: document.getElementById('adminResetUserLabel'),
    adminResetNewPassword: document.getElementById('adminResetNewPassword'),
    btnCancelAdminReset: document.getElementById('btnCancelAdminReset'),
    adminDeleteConfirmBar: document.getElementById('adminDeleteConfirmBar'),
    adminDeleteUserId: document.getElementById('adminDeleteUserId'),
    adminDeleteUserLabel: document.getElementById('adminDeleteUserLabel'),
    btnCancelAdminDelete: document.getElementById('btnCancelAdminDelete'),
    btnConfirmAdminDelete: document.getElementById('btnConfirmAdminDelete'),
    adminConsoleFeedback: document.getElementById('adminConsoleFeedback'),
    adminUsersTableBody: document.getElementById('adminUsersTableBody'),
  };

  // Toast Utilities

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    DOM.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  let currentTerminalFilter = 'all';
  let cachedTerminalLogs = ['[INFO] Multi-Cloud Deployment Dashboard ready. Logs stream live.'];

  function matchesTerminalFilter(line, filter) {
    if (!filter || filter === 'all') return true;
    const text = String(line || '');
    const upper = text.toUpperCase();
    if (filter === 'cf' || filter === 'cloudflare') {
      return upper.includes('[CLOUDFLARE') || upper.includes('CLOUDFLARE') || upper.includes('WORKERS');
    }
    if (filter === 'gh' || filter === 'github') {
      return upper.includes('[GITHUB') || upper.includes('[DEPLOY') || upper.includes('GITHUB');
    }
    if (filter === 'build') {
      return upper.includes('[BUILD') || upper.includes('[ASSETS') || upper.includes('[WEBP');
    }
    return true;
  }

  function appendTerminalLog(msg, type = 'info') {
    const text = String(msg || '');
    cachedTerminalLogs.push(text);
    if (cachedTerminalLogs.length > 500) {
      cachedTerminalLogs = cachedTerminalLogs.slice(-500);
    }
    if (!DOM.terminalBody) return;
    if (!matchesTerminalFilter(text, currentTerminalFilter)) return;
    const line = document.createElement('div');
    line.className = `log-${type}`;
    line.textContent = text;
    DOM.terminalBody.appendChild(line);
    DOM.terminalBody.scrollTop = DOM.terminalBody.scrollHeight;
  }

  // Scope workspace-local asset paths (/assets/...) to the active isolated user space
  function toSpaceAssetUrl(url) {
    if (!url || typeof url !== 'string') return url || '';
    const trimmed = url.trim();
    if (!trimmed || !state.activeSpaceId) return trimmed;
    if (trimmed.startsWith('/assets/')) {
      return `/spaces/${encodeURIComponent(state.activeSpaceId)}${trimmed}`;
    }
    return trimmed;
  }

  // API Call Wrapper (injects in-memory Bearer token & optional Admin X-Space-Id header)

  async function api(endpoint, method = 'GET', data = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.authToken) {
      headers['Authorization'] = `Bearer ${state.authToken}`;
    }
    if (
      state.currentUser &&
      state.currentUser.role === 'admin' &&
      state.activeSpaceId &&
      state.activeSpaceId !== state.currentUser.space_id
    ) {
      headers['X-Space-Id'] = state.activeSpaceId;
    }

    const opts = {
      method,
      headers,
    };

    if (data && (method === 'POST' || method === 'PUT' || method === 'DELETE' || method === 'PATCH')) {
      opts.body = JSON.stringify(data);
    }

    const res = await fetch(endpoint, opts);
    if (!res.ok) {
      let errText = res.statusText;
      try {
        const errJson = await res.json();
        errText = errJson.error || errText;
      } catch (e) {}
      const isPublicAuthEndpoint =
        endpoint.startsWith('/api/auth/login') ||
        endpoint.startsWith('/api/auth/register') ||
        endpoint.startsWith('/api/auth/setup-admin') ||
        endpoint.startsWith('/api/auth/status');
      if (res.status === 401 && !isPublicAuthEndpoint && state.authToken) {
        clearSessionToAuthGate('Your session expired or was revoked. Please sign in again.');
      }
      throw new Error(errText);
    }
    return res.json();
  }

  // Active platform state: 'cloudflare' | 'github' | 'dual'
  let currentPlatformMode = 'cloudflare';

  function updateStepperActive(tabTarget) {
    const stepCards = [DOM.stepCardIngest, DOM.stepCardThemes, DOM.stepCardPosts, DOM.stepCardDeploy];
    stepCards.forEach((c) => {
      if (c) {
        c.classList.remove('active');
        const badge = c.querySelector('.step-badge');
        if (badge) badge.classList.remove('active-badge');
      }
    });

    let activeCard = null;
    if (tabTarget === 'tab-ingest') {
      activeCard = DOM.stepCardIngest;
    } else if (tabTarget === 'tab-themes') {
      activeCard = DOM.stepCardThemes;
    } else if (tabTarget === 'tab-posts') {
      activeCard = DOM.stepCardPosts;
    } else if (tabTarget === 'tab-deploy' || tabTarget === 'tab-preview') {
      activeCard = DOM.stepCardDeploy;
    }

    if (activeCard) {
      activeCard.classList.add('active');
      const badge = activeCard.querySelector('.step-badge');
      if (badge) badge.classList.add('active-badge');
    }
  }

  function openPlatformSettings(tab) {
    if (!tab) tab = (typeof currentPlatformMode !== 'undefined' && currentPlatformMode === 'github') ? 'github' : 'cloudflare';
    if (!DOM.platformSettingsModal) return;
    DOM.platformSettingsModal.classList.add('active');
    DOM.platformSettingsModal.style.display = 'flex';
    switchSettingsModalTab(tab);
    document.body.style.overflow = 'hidden';
  }

  function closePlatformSettings() {
    if (!DOM.platformSettingsModal) return;
    DOM.platformSettingsModal.classList.remove('active');
    DOM.platformSettingsModal.style.display = 'none';
    document.body.style.overflow = '';
  }

  function switchSettingsModalTab(tab) {
    if (tab === 'github') {
      if (DOM.modalTabBtnGh) DOM.modalTabBtnGh.classList.add('active', 'gh');
      if (DOM.modalTabBtnCf) DOM.modalTabBtnCf.classList.remove('active', 'cf');
      if (DOM.settingsPaneGh) DOM.settingsPaneGh.style.display = 'block';
      if (DOM.settingsPaneCf) DOM.settingsPaneCf.style.display = 'none';
    } else {
      if (DOM.modalTabBtnCf) DOM.modalTabBtnCf.classList.add('active', 'cf');
      if (DOM.modalTabBtnGh) DOM.modalTabBtnGh.classList.remove('active', 'gh');
      if (DOM.settingsPaneCf) DOM.settingsPaneCf.style.display = 'block';
      if (DOM.settingsPaneGh) DOM.settingsPaneGh.style.display = 'none';
    }
  }

  window.openPlatformSettings = openPlatformSettings;
  window.closePlatformSettings = closePlatformSettings;

  function computeGithubLiveUrl() {
    const gh = state.config.github || {};
    const owner = (DOM.cfgStep1GithubOwner && DOM.cfgStep1GithubOwner.value.trim()) || gh.owner || '';
    const repo = (DOM.cfgStep1GithubRepo && DOM.cfgStep1GithubRepo.value.trim()) || gh.repo || '';
    if (repo && repo.endsWith('.github.io')) return `https://${repo}`;
    if (owner && repo) return `https://${owner}.github.io/${repo}`;
    if (owner) return `https://${owner}.github.io`;
    return '#';
  }

  function setActivePlatformView(view) {
    if (!view || view === 'cloudflare') view = 'cf';
    if (view === 'github') view = 'gh';
    currentPlatformMode = view === 'cf' ? 'cloudflare' : 'github';
    state.activePlatform = currentPlatformMode;

    // 1. Show strictly the selected workspace, hide the other
    if (DOM.workspaceCloudflare && DOM.workspaceGithub) {
      DOM.workspaceCloudflare.style.display = view === 'cf' ? 'flex' : 'none';
      DOM.workspaceGithub.style.display = view === 'gh' ? 'flex' : 'none';
    }

    // 2. Update target URL preview in top telemetry ribbon
    if (view === 'cf') {
      const cfUrl = computeCloudflareLiveUrl();
      if (DOM.statTargetUrl) {
        DOM.statTargetUrl.textContent = cfUrl + ' ↗';
        DOM.statTargetUrl.href = cfUrl;
      }
      if (DOM.statPlatformCard) DOM.statPlatformCard.style.borderLeftColor = 'var(--accent-cloudflare)';
    } else {
      const ghUrl = computeGithubLiveUrl();
      if (DOM.statTargetUrl) {
        DOM.statTargetUrl.textContent = ghUrl === '#' ? '—' : ghUrl + ' ↗';
        DOM.statTargetUrl.href = ghUrl;
      }
      if (DOM.statPlatformCard) DOM.statPlatformCard.style.borderLeftColor = 'var(--accent-github)';
    }

    // 3. Synchronize Selected Platform Indicator near Brand Logo
    if (DOM.selectedPlatformBadge && DOM.selectedPlatformIcon && DOM.selectedPlatformText) {
      if (view === 'cf') {
        DOM.selectedPlatformBadge.className = 'platform-selected-badge cf';
        DOM.selectedPlatformIcon.textContent = '🟧';
        DOM.selectedPlatformText.textContent = 'Cloudflare Edge';
      } else {
        DOM.selectedPlatformBadge.className = 'platform-selected-badge gh';
        DOM.selectedPlatformIcon.textContent = '🐙';
        DOM.selectedPlatformText.textContent = 'GitHub Pages';
      }
    }

    // 4. Synchronize Step 1 Ingestion Platform Target Cadres
    if (DOM.step1ActivePlatformTitle) {
      DOM.step1ActivePlatformTitle.textContent =
        view === 'cf'
          ? '🌐 Active Deployment Target: Cloudflare Edge'
          : '🌐 Active Deployment Target: GitHub Pages';
    }
    if (DOM.step1TargetCadreCf && DOM.step1TargetCadreGh) {
      DOM.step1TargetCadreCf.style.display = view === 'cf' ? 'block' : 'none';
      DOM.step1TargetCadreGh.style.display = view === 'gh' ? 'block' : 'none';
    }
  }

  window.setActivePlatformView = setActivePlatformView;
  window.switchTab = switchTab;

  function switchTab(tabId, platform) {
    state.activeTab = tabId;
    if (platform) state.activePlatform = platform;
    DOM.panes.forEach((p) => {
      if (p.id === tabId) p.classList.add('active');
      else p.classList.remove('active');
    });

    if (tabId === 'tab-deploy') {
      const view = (platform || currentPlatformMode) === 'github' ? 'gh' : 'cf';
      setActivePlatformView(view);
    }
    updateStepperActive(tabId);
    if (tabId === 'tab-preview') {
      triggerPreview();
    }
  }

  // Tab Navigation Handling
  // =========================================================================
  // MULTI-PROJECT MANAGEMENT SYSTEM
  // =========================================================================

  function populateActiveProjectFields(proj) {
    if (!proj) return;
    if (proj.platform === 'github' || proj.platform === 'cloudflare') {
      setActivePlatformView(proj.platform === 'github' ? 'gh' : 'cf');
    }
    if (DOM.ingestSitemapUrl) {
      DOM.ingestSitemapUrl.value = proj.sitemap_url || '';
    }
    if (DOM.ingestMaxPosts && proj.max_posts !== undefined && proj.max_posts !== null) {
      DOM.ingestMaxPosts.value = proj.max_posts;
    }
    if (DOM.ingestDownloadImages && proj.download_images !== undefined) {
      DOM.ingestDownloadImages.checked = !!proj.download_images;
    }
    if (DOM.cfgCfProjectName) {
      DOM.cfgCfProjectName.value = proj.cf_project_name || proj.id || '';
    }
    if (DOM.cfgCfCustomDomain) {
      DOM.cfgCfCustomDomain.value = proj.cf_custom_domain || '';
    }
    const ghOwnerVal = proj.gh_owner !== undefined ? proj.gh_owner : (proj.github_owner || '');
    const ghRepoVal = proj.gh_repo !== undefined ? proj.gh_repo : (proj.github_repo || '');
    if (DOM.cfgStep1GithubOwner) {
      DOM.cfgStep1GithubOwner.value = ghOwnerVal;
    }
    if (DOM.cfgStep1GithubRepo) {
      DOM.cfgStep1GithubRepo.value = ghRepoVal;
    }
    if (DOM.scanResultBanner) {
      DOM.scanResultBanner.style.display = 'none';
    }
    if (DOM.diffSummaryTableBody) {
      DOM.diffSummaryTableBody.innerHTML = '';
    }
    if (DOM.diffNewCount) DOM.diffNewCount.textContent = '0';
    if (DOM.diffUpdatedCount) DOM.diffUpdatedCount.textContent = '0';
    if (DOM.diffSyncedCount) DOM.diffSyncedCount.textContent = '0';
    updateCloudflareLiveUrlPreview();
    updateRootDomainPreview();
  }

  async function autoSaveActiveProject() {
    if (!state.activeProject) return;
    const updates = {};
    if (DOM.ingestSitemapUrl) updates.sitemap_url = DOM.ingestSitemapUrl.value.trim();
    if (DOM.ingestMaxPosts) {
      const parsed = parseInt(DOM.ingestMaxPosts.value, 10);
      updates.max_posts = Number.isNaN(parsed) ? 100 : Math.max(0, parsed);
    }
    if (DOM.ingestDownloadImages) updates.download_images = DOM.ingestDownloadImages.checked;
    if (DOM.cfgCfProjectName) {
      updates.cf_project_name = DOM.cfgCfProjectName.value.trim();
      updates.worker_name = updates.cf_project_name;
    }
    if (DOM.cfgCfCustomDomain) {
      updates.cf_custom_domain = DOM.cfgCfCustomDomain.value.trim();
      updates.custom_domain = updates.cf_custom_domain;
    }
    if (DOM.cfgStep1GithubOwner) {
      updates.github_owner = DOM.cfgStep1GithubOwner.value.trim();
      updates.gh_owner = updates.github_owner;
    }
    if (DOM.cfgStep1GithubRepo) {
      updates.github_repo = DOM.cfgStep1GithubRepo.value.trim();
      updates.gh_repo = updates.github_repo;
    }
    try {
      const payload = {
        project_id: state.activeProject,
        updates: updates,
        ...updates,
      };
      const res = await api('/api/projects/update', 'POST', payload);
      if (res && res.project && state.projects) {
        const idx = state.projects.findIndex((p) => p.id === state.activeProject);
        if (idx !== -1) {
          state.projects[idx] = { ...state.projects[idx], ...res.project };
        }
      }
      updateCloudflareLiveUrlPreview();
      return res;
    } catch (err) {
      console.warn('Auto-save active project failed:', err);
    }
  }

  async function loadProjects() {
    try {
      const res = await api('/api/projects');
      if (res && res.projects) {
        state.projects = res.projects;
        if (res.active_project) {
          state.activeProject = res.active_project;
        }
        renderProjectSelector();
        const curProj = state.projects.find((p) => p.id === state.activeProject);
        if (curProj && curProj.theme) {
          syncThemeToUI(curProj.theme);
        }
      }
    } catch (err) {
      console.warn('Could not load projects list:', err);
    }
  }

  function renderProjectSelector() {
    if (!DOM.selectActiveProject) return;
    DOM.selectActiveProject.innerHTML = '';
    if (!state.projects || state.projects.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No Projects (Click + New Project)';
      DOM.selectActiveProject.appendChild(opt);
      return;
    }
    state.projects.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      const count = p.total_posts || 0;
      opt.textContent = `${p.name || p.id} (${count} posts)`;
      if (p.id === state.activeProject) {
        opt.selected = true;
      }
      DOM.selectActiveProject.appendChild(opt);
    });
  }

  async function switchProject(projectId) {
    if (!projectId || projectId === state.activeProject) return;
    try {
      appendTerminalLog(`[PROJECT] Switching active project to '${projectId}'...`, 'info');
      const res = await api('/api/projects/switch', 'POST', { project_id: projectId });
      state.activeProject = res.active_project || projectId;
      state.selectedPostSlug = null;
      state.allCategories = [];
      state.allCategoriesProject = null;
      if (res.project) {
        populateActiveProjectFields(res.project);
      }
      showToast(res.message || `Switched to project ${projectId}`, 'success');
      appendTerminalLog(`[PROJECT] Active project is now '${state.activeProject}' (${res.total_posts} posts, ${res.categories_count} categories).`, 'success');

      // Refresh status, full per-project config, posts, Site Pages, projects list, and live preview
      await loadProjects();
      await refreshSystem();
      await refreshPosts();
      await refreshStaticPages();
      triggerPreview();
    } catch (err) {
      showToast(`Failed switching project: ${err.message}`, 'error');
      appendTerminalLog(`[PROJECT ERROR] ${err.message}`, 'error');
    }
  }

  function openNewProjectModal() {
    if (!DOM.modalNewProject) return;
    DOM.modalNewProject.style.display = 'flex';
    DOM.modalNewProject.setAttribute('aria-hidden', 'false');
    if (DOM.newProjName) {
      DOM.newProjName.value = '';
      DOM.newProjName.focus();
    }
    if (DOM.newProjCfWorker && DOM.cfgCfProjectName) {
      DOM.newProjCfWorker.value = '';
    }
    if (DOM.newProjGhOwner) {
      DOM.newProjGhOwner.value = (DOM.cfgStep1GithubOwner && DOM.cfgStep1GithubOwner.value) || '';
    }
    if (DOM.newProjGhRepo) {
      DOM.newProjGhRepo.value = '';
    }
    if (DOM.newProjSitemapUrl) {
      DOM.newProjSitemapUrl.value = '';
    }
  }

  function closeNewProjectModal() {
    if (!DOM.modalNewProject) return;
    DOM.modalNewProject.style.display = 'none';
    DOM.modalNewProject.setAttribute('aria-hidden', 'true');
  }

  async function handleCreateNewProject(e) {
    e.preventDefault();
    const name = (DOM.newProjName && DOM.newProjName.value.trim()) || '';
    if (!name) {
      showToast('Please enter a project name', 'error');
      return;
    }

    const payload = {
      name,
      platform: (DOM.newProjPlatform && DOM.newProjPlatform.value) || 'cloudflare',
      cf_project_name: (DOM.newProjCfWorker && DOM.newProjCfWorker.value.trim()) || '',
      cf_custom_domain: (DOM.newProjCfDomain && DOM.newProjCfDomain.value.trim()) || '',
      gh_owner: (DOM.newProjGhOwner && DOM.newProjGhOwner.value.trim()) || '',
      gh_repo: (DOM.newProjGhRepo && DOM.newProjGhRepo.value.trim()) || '',
      sitemap_url: (DOM.newProjSitemapUrl && DOM.newProjSitemapUrl.value.trim()) || '',
    };

    try {
      appendTerminalLog(`[PROJECT] Creating new isolated project '${name}'...`, 'info');
      const res = await api('/api/projects', 'POST', payload);
      closeNewProjectModal();
      showToast(res.message || `Project '${name}' created with empty categories!`, 'success');
      appendTerminalLog(`[PROJECT] Project '${name}' created. Starting with 0 posts and empty categories.`, 'success');

      // Update active state
      state.activeProject = res.active_project || name.toLowerCase();
      state.selectedPostSlug = null;
      state.allCategories = [];
      state.allCategoriesProject = null;
      if (res.project) {
        populateActiveProjectFields(res.project);
      }

      // Clear posts and categories immediately
      state.posts = [];
      populateCategoryFilter();
      renderPostsTable();

      // Refresh all systems with the new project's isolated settings
      await loadProjects();
      await refreshSystem();
      await refreshPosts();
      await refreshStaticPages();
      triggerPreview();
    } catch (err) {
      showToast(`Error creating project: ${err.message}`, 'error');
      appendTerminalLog(`[PROJECT ERROR] ${err.message}`, 'error');
    }
  }

  function initProjectSystem() {
    if (DOM.selectActiveProject) {
      DOM.selectActiveProject.addEventListener('change', (e) => {
        switchProject(e.target.value);
      });
    }

    if (DOM.btnNewProject) {
      DOM.btnNewProject.addEventListener('click', openNewProjectModal);
    }
    if (DOM.btnCloseNewProjectModal) {
      DOM.btnCloseNewProjectModal.addEventListener('click', closeNewProjectModal);
    }
    if (DOM.btnCancelNewProject) {
      DOM.btnCancelNewProject.addEventListener('click', closeNewProjectModal);
    }
    if (DOM.modalNewProject) {
      DOM.modalNewProject.addEventListener('click', (e) => {
        if (e.target === DOM.modalNewProject) closeNewProjectModal();
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && DOM.modalNewProject && DOM.modalNewProject.style.display === 'flex') {
        closeNewProjectModal();
      }
    });
    if (DOM.newProjectForm) {
      DOM.newProjectForm.addEventListener('submit', handleCreateNewProject);
    }

    // Auto-save Step 1 ingestion inputs on change or blur (CF inputs have dedicated debounced save in initListeners)
    const step1Inputs = [
      DOM.ingestSitemapUrl,
      DOM.ingestMaxPosts,
      DOM.ingestDownloadImages,
    ].filter(Boolean);
    step1Inputs.forEach((el) => {
      el.addEventListener('change', autoSaveActiveProject);
      if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'url' || el.type === 'number')) {
        el.addEventListener('blur', autoSaveActiveProject);
      }
    });

    // Two-way synchronization for Step 1 GitHub inputs (single debounced save)
    if (DOM.cfgStep1GithubOwner) {
      DOM.cfgStep1GithubOwner.addEventListener('change', async () => {
        const val = DOM.cfgStep1GithubOwner.value.trim();
        updateRootDomainPreview();
        await autoSaveActiveProject();
        if (val) showToast(`GitHub Organization updated to '${val}'`, 'info');
      });
    }

    if (DOM.cfgStep1GithubRepo) {
      DOM.cfgStep1GithubRepo.addEventListener('change', async () => {
        const val = DOM.cfgStep1GithubRepo.value.trim();
        updateRootDomainPreview();
        await autoSaveActiveProject();
        if (val) showToast(`GitHub Repository updated to '${val}'`, 'info');
      });
    }
  }

  function computeCloudflareLiveUrl() {
    const proj = (DOM.cfgCfProjectName && DOM.cfgCfProjectName.value.trim()) || state.activeProject || 'stylesdays';
    const deployType = (DOM.cfgCfDeployType && DOM.cfgCfDeployType.value) || 'workers_assets';
    const subdomain = (DOM.cfgCfAccountSubdomain && DOM.cfgCfAccountSubdomain.value.trim()) || '';
    if (subdomain) {
      return 'https://' + proj + '.' + subdomain + '.workers.dev';
    }
    if (deployType === 'pages') {
      return 'https://' + proj + '.pages.dev';
    }
    return 'https://' + proj + '.workers.dev';
  }

  function updateCloudflareLiveUrlPreview() {
    const url = computeCloudflareLiveUrl();
    if (DOM.statTargetUrl && currentPlatformMode === 'cloudflare') {
      DOM.statTargetUrl.textContent = url + ' ↗';
      DOM.statTargetUrl.href = url;
    }
    return url;
  }

  function initPlatformDivision() {
    if (DOM.selectedPlatformBadge) {
      DOM.selectedPlatformBadge.addEventListener('click', async () => {
        const nextMode = currentPlatformMode === 'cloudflare' ? 'gh' : 'cf';
        setActivePlatformView(nextMode);
        if (state.activeProject) {
          const nextPlatform = nextMode === 'gh' ? 'github' : 'cloudflare';
          try {
            await api('/api/projects/update', 'POST', {
              project_id: state.activeProject,
              platform: nextPlatform,
            });
            const cur = state.projects && state.projects.find((p) => p.id === state.activeProject);
            if (cur) cur.platform = nextPlatform;
          } catch (err) {
            console.warn('Could not persist active platform for project:', err);
          }
        }
      });
    }

    if (DOM.toggleTerminalSizeBtn && DOM.terminalSection) {
      DOM.toggleTerminalSizeBtn.addEventListener('click', () => {
        DOM.terminalSection.classList.toggle('terminal-expanded');
      });
    }

    // Platform Settings Modal Event Listeners
    if (DOM.btnOpenSettings) {
      DOM.btnOpenSettings.addEventListener('click', () => openPlatformSettings());
    }
    if (DOM.btnCloseSettingsModal) {
      DOM.btnCloseSettingsModal.addEventListener('click', closePlatformSettings);
    }
    if (DOM.platformSettingsModal) {
      DOM.platformSettingsModal.addEventListener('click', (e) => {
        if (e.target === DOM.platformSettingsModal) {
          closePlatformSettings();
        }
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && DOM.platformSettingsModal && DOM.platformSettingsModal.classList.contains('active')) {
        closePlatformSettings();
      }
    });
    if (DOM.modalTabBtnCf) {
      DOM.modalTabBtnCf.addEventListener('click', () => switchSettingsModalTab('cloudflare'));
    }
    if (DOM.modalTabBtnGh) {
      DOM.modalTabBtnGh.addEventListener('click', () => switchSettingsModalTab('github'));
    }

    // Stepper click handlers
    [DOM.stepCardIngest, DOM.stepCardThemes, DOM.stepCardPosts, DOM.stepCardDeploy].forEach((card) => {
      if (card) {
        card.addEventListener('click', () => {
          const target = card.getAttribute('data-target');
          if (target) switchTab(target);
        });
      }
    });

    if (DOM.triggerBuildGhBtn && DOM.triggerBuildBtn) {
      DOM.triggerBuildGhBtn.addEventListener('click', () => DOM.triggerBuildBtn.click());
    }
  }

  function updateLogoPreview(logoPath, brandName, tagline) {
    const bName = brandName || (DOM.cfgBrandName ? DOM.cfgBrandName.value.trim() : '') || 'Anna Deco';
    const tag = tagline || (DOM.cfgBrandTagline ? DOM.cfgBrandTagline.value.trim() : '') || 'Curated Interior Design & Architectural Aesthetic';
    if (DOM.quickBrandNameDisplay) DOM.quickBrandNameDisplay.textContent = bName;
    if (DOM.previewBrandNameDisplay) DOM.previewBrandNameDisplay.textContent = bName;
    if (DOM.quickTaglineDisplay) DOM.quickTaglineDisplay.textContent = tag;
    const initials = (bName.slice(0, 2) || 'AD').toUpperCase();
    const emblemSvg = `

      <svg width="40" height="40" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">

        <circle cx="50" cy="50" r="46" fill="#FAF8F5" stroke="#1C1917" stroke-width="3"/>

        <circle cx="50" cy="50" r="40" fill="none" stroke="#D97706" stroke-width="1.5" stroke-dasharray="3 3"/>

        <path d="M 32 68 L 32 44 C 32 30, 68 30, 68 44 L 68 68 Z" stroke="#1C1917" stroke-width="2.5" fill="none"/>

        <text x="50" y="58" font-family="'Playfair Display', Georgia, serif" font-size="20" font-weight="700" fill="#1C1917" text-anchor="middle">${escapeHtml(initials)}</text>

        <circle cx="50" cy="24" r="3" fill="#D97706"/>

      </svg>`;
    if (logoPath) {
      const resolvedLogoUrl = toSpaceAssetUrl(logoPath);
      const sep = resolvedLogoUrl.includes('?') ? '&' : '?';
      const logoImgHtml = `<img src="${escapeHtml(resolvedLogoUrl)}${sep}t=${Date.now()}" alt="${escapeHtml(bName)}" style="max-height: 48px; max-width: 100%; object-fit: contain;">`;
      if (DOM.quickLogoPreviewBox) DOM.quickLogoPreviewBox.innerHTML = logoImgHtml;
      if (DOM.previewLogoBox) DOM.previewLogoBox.innerHTML = logoImgHtml;
      if (DOM.quickBrandNameDisplay) DOM.quickBrandNameDisplay.style.display = 'none';
      if (DOM.previewBrandNameDisplay) DOM.previewBrandNameDisplay.style.display = 'none';
      if (DOM.quickLogoStatusBadge) {
        DOM.quickLogoStatusBadge.textContent = 'Custom Logo Active';
        DOM.quickLogoStatusBadge.style.color = '#34D399';
        DOM.quickLogoStatusBadge.style.background = 'rgba(16, 185, 129, 0.15)';
        DOM.quickLogoStatusBadge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      }
    } else {
      if (DOM.quickLogoPreviewBox) DOM.quickLogoPreviewBox.innerHTML = emblemSvg;
      if (DOM.previewLogoBox) DOM.previewLogoBox.innerHTML = emblemSvg;
      if (DOM.quickBrandNameDisplay) DOM.quickBrandNameDisplay.style.display = '';
      if (DOM.previewBrandNameDisplay) DOM.previewBrandNameDisplay.style.display = '';
      if (DOM.quickLogoStatusBadge) {
        DOM.quickLogoStatusBadge.textContent = 'Default Emblem Active';
        DOM.quickLogoStatusBadge.style.color = '#F59E0B';
        DOM.quickLogoStatusBadge.style.background = 'rgba(245, 158, 11, 0.15)';
        DOM.quickLogoStatusBadge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
      }
    }
  }

  // Universal Theme Synchronizer: binds theme to inputs, previews, pills and card gallery
  function syncThemeToUI(themeKey) {
    if (!themeKey) return;
    if (DOM.cfgTheme) DOM.cfgTheme.value = themeKey;
    if (DOM.previewThemeSelect) DOM.previewThemeSelect.value = themeKey;
    if (DOM.quickDeployThemeSelect) DOM.quickDeployThemeSelect.value = themeKey;
    if (DOM.statTheme) DOM.statTheme.textContent = themeKey;
    document.querySelectorAll('.theme-card').forEach((card) => {
      if (card.dataset.theme === themeKey) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });
  }

  async function refreshSystem() {
    try {
      const [status, cfg] = await Promise.all([api('/api/status'), api('/api/config')]);
      state.status = status;
      state.config = cfg;

      // Update UI Header & Stats
      DOM.statTotalPosts.textContent = status.total_posts;
      if (DOM.statProjectAssets) DOM.statProjectAssets.textContent = status.local_images_count || 0;
      DOM.statNewPosts.textContent = status.new;
      DOM.statCustomPosts.textContent = status.custom_edited;
      DOM.statTheme.textContent = status.theme;

      // Populate Cloudflare Settings Inputs
      const cf = cfg.cloudflare || {};
      if (DOM.cfgCfToken) {
        DOM.cfgCfToken.placeholder = cf.token_masked || 'Bearer Token with Workers Edit permissions';
        if (cf.has_token) {
          if (!DOM.cfgCfToken.value || DOM.cfgCfToken.value.includes('****')) {
            DOM.cfgCfToken.value = cf.token_masked || '';
          }
        } else {
          DOM.cfgCfToken.value = '';
        }
        if (DOM.cfTokenStatusBadge) {
          DOM.cfTokenStatusBadge.textContent = cf.has_token ? '● Token Active' : '○ Missing Token';
          DOM.cfTokenStatusBadge.style.color = cf.has_token ? '#10B981' : '#F59E0B';
        }
      }

      const activeProj =
        (cfg.projects && cfg.projects[cfg.active_project || state.activeProject]) ||
        (state.projects && state.projects.find((p) => p.id === state.activeProject)) ||
        {};
      if (cfg.active_project) {
        state.activeProject = cfg.active_project;
      }
      if (activeProj.platform === 'github' || activeProj.platform === 'cloudflare') {
        setActivePlatformView(activeProj.platform === 'github' ? 'gh' : 'cf');
      }
      if (DOM.cfgCfAccountId) DOM.cfgCfAccountId.value = cf.account_id || '';
      if (DOM.cfgCfAccountSubdomain) DOM.cfgCfAccountSubdomain.value = cf.account_subdomain || '';
      if (DOM.cfgCfProjectName) DOM.cfgCfProjectName.value = activeProj.cf_project_name || cf.project_name || activeProj.id || state.activeProject || 'stylesdays';
      if (DOM.cfgCfDeployType) DOM.cfgCfDeployType.value = activeProj.cf_deployment_type || cf.deployment_type || 'workers_assets';
      if (DOM.cfgCfCustomDomain) DOM.cfgCfCustomDomain.value = activeProj.cf_custom_domain !== undefined ? activeProj.cf_custom_domain : (cf.custom_domain || '');
      if (DOM.cfgCfCompatibilityDate) DOM.cfgCfCompatibilityDate.value = activeProj.cf_compatibility_date || cf.compatibility_date || '2024-11-01';
      updateCloudflareLiveUrlPreview();

      // Populate GitHub Settings Inputs
      const gh = cfg.github || {};
      DOM.cfgGithubToken.placeholder = gh.token_masked || 'ghp_xxxxxxxxxxxxxxxxxxxx';
      if (!gh.has_token) {
        DOM.cfgGithubToken.value = '';
      } else if (!DOM.cfgGithubToken.value || DOM.cfgGithubToken.value.includes('****')) {
        DOM.cfgGithubToken.value = gh.token_masked || '';
      }
      if (DOM.tokenStatusBadge) {
        DOM.tokenStatusBadge.textContent = gh.has_token ? '● Token Active' : '○ Missing Token';
        DOM.tokenStatusBadge.style.color = gh.has_token ? '#10B981' : '#F59E0B';
      }
      const projGhOwner = activeProj.gh_owner !== undefined ? activeProj.gh_owner : (activeProj.github_owner !== undefined ? activeProj.github_owner : (gh.owner || ''));
      const projGhRepo = activeProj.gh_repo !== undefined ? activeProj.gh_repo : (activeProj.github_repo !== undefined ? activeProj.github_repo : (gh.repo || ''));
      if (DOM.cfgStep1GithubOwner) DOM.cfgStep1GithubOwner.value = projGhOwner;
      if (DOM.cfgStep1GithubRepo) DOM.cfgStep1GithubRepo.value = projGhRepo;
      DOM.cfgGithubBranch.value = activeProj.gh_branch || gh.branch || 'main';
      DOM.cfgGithubBasePath.value = activeProj.gh_base_path !== undefined ? activeProj.gh_base_path : (gh.base_path || '');
      if (DOM.cfgStep1AutoRootOrg) {
        DOM.cfgStep1AutoRootOrg.checked = (projGhRepo && projGhRepo.endsWith('.github.io')) || (!projGhRepo && gh.is_org);
      }

      if (currentPlatformMode === 'github' && DOM.statTargetUrl) {
        const ghUrl = computeGithubLiveUrl();
        DOM.statTargetUrl.textContent = ghUrl === '#' ? '—' : ghUrl + ' ↗';
        DOM.statTargetUrl.href = ghUrl;
      }
      updateRootDomainPreview();
      const bld = cfg.build || {};
      const authoritativeTheme = (bld && bld.theme) || activeProj.theme || (status && status.theme) || 'nordic-studio';
      const authoritativeRouting = (bld && bld.routing_mode) || activeProj.routing_mode || (status && status.routing_mode) || 'single';
      syncThemeToUI(authoritativeTheme);
      DOM.cfgRoutingMode.value = authoritativeRouting;
      DOM.previewRoutingSelect.value = authoritativeRouting;
      if (activeProj) activeProj.theme = authoritativeTheme;

      // Update active cards in Routing gallery
      document.querySelectorAll('.routing-card').forEach((card) => {
        if (card.dataset.routing === authoritativeRouting) {
          card.classList.add('active');
        } else {
          card.classList.remove('active');
        }
      });

      DOM.cfgOutputDir.value = activeProj.output_dir || bld.output_dir || 'dist_github_pages';
      const ing = cfg.ingestion || {};
      DOM.cfgWpApiUrl.value = activeProj.wp_api_url !== undefined ? activeProj.wp_api_url : (ing.wp_api_url || '');
      DOM.ingestSitemapUrl.value =
        activeProj.sitemap_url !== undefined ? activeProj.sitemap_url : (ing.sitemap_url || '');
      DOM.ingestMaxPosts.value =
        activeProj.max_posts !== undefined && activeProj.max_posts !== null
          ? activeProj.max_posts
          : (ing.max_posts !== undefined ? ing.max_posts : 100);
      DOM.ingestDownloadImages.checked = activeProj.download_images !== undefined ? !!activeProj.download_images : (ing.download_images !== false);

      // Populate Branding and pSEO settings (100% isolated per active project)
      const branding = cfg.branding || activeProj.branding || status.branding || {};
      if (DOM.cfgBrandName) DOM.cfgBrandName.value = branding.brand_name || activeProj.name || 'Atelier Maison';
      if (DOM.cfgBrandTagline) DOM.cfgBrandTagline.value = branding.tagline || 'Interior Design & Curated Living';
      if (DOM.cfgAuthorName) DOM.cfgAuthorName.value = branding.author_name || 'Editorial Team';
      if (DOM.cfgAuthorBio) DOM.cfgAuthorBio.value = branding.author_bio || 'Interior Design Specialist & Home Architecture Curator';
      if (DOM.cfgEnableToc) DOM.cfgEnableToc.checked = branding.enable_toc !== false;
      if (DOM.cfgEnableFaq) DOM.cfgEnableFaq.checked = branding.enable_faq !== false;
      if (DOM.cfgEnableEeat) DOM.cfgEnableEeat.checked = branding.enable_eeat !== false;
      const socialLinks = branding.social_links || {};
      if (DOM.cfgSocialPinterest) DOM.cfgSocialPinterest.value = socialLinks.pinterest || '';
      if (DOM.cfgSocialFacebook) DOM.cfgSocialFacebook.value = socialLinks.facebook || '';
      if (DOM.cfgSocialInstagram) DOM.cfgSocialInstagram.value = socialLinks.instagram || '';
      if (DOM.cfgSocialTwitter) DOM.cfgSocialTwitter.value = socialLinks.twitter || '';
      if (DOM.cfgSocialTiktok) DOM.cfgSocialTiktok.value = socialLinks.tiktok || '';
      if (DOM.cfgSocialYoutube) DOM.cfgSocialYoutube.value = socialLinks.youtube || '';
      if (DOM.cfgCustomHeadCode) {
        DOM.cfgCustomHeadCode.value = branding.custom_head_code !== undefined ? branding.custom_head_code : (activeProj.custom_head_code || '');
        updateHeadCodeStats();
      }
      updateLogoPreview(branding.logo_path || '', branding.brand_name || activeProj.name, branding.tagline);

      // Populate Preview Options
      DOM.previewThemeSelect.value = authoritativeTheme;
      DOM.previewRoutingSelect.value = authoritativeRouting;
      await loadGithubAccounts();
      await refreshPosts();
      await syncActiveIngestJobUI();
    } catch (err) {
      showToast(`Initialization Error: ${err.message}`, 'error');
    }
  }

  function setIngestRunningUI(running, message = '') {
    state.isIngesting = running;
    if (DOM.startIngestBtn) {
      DOM.startIngestBtn.disabled = running;
      DOM.startIngestBtn.innerHTML = running ? '<span>⏳ Ingesting...</span>' : '<span>🚀 Ingest &amp; Diff</span>';
    }
    if (DOM.stopIngestBtn) {
      DOM.stopIngestBtn.disabled = !running;
    }
    if (running && DOM.ingestProgressBarContainer) {
      DOM.ingestProgressBarContainer.classList.remove('hidden');
      DOM.ingestProgressBarContainer.style.display = 'block';
    }
    if (message && DOM.ingestProgressLabel) {
      DOM.ingestProgressLabel.textContent = message;
    }
  }

  function addDiffRowGlobal(slug, title, status, badgeClass) {
    if (!DOM.diffSummaryTableBody) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="badge ${badgeClass}">${status}</span></td>
      <td><code>${escapeHtml(slug)}</code></td>
      <td>${escapeHtml(title)}</td>
    `;
    DOM.diffSummaryTableBody.appendChild(tr);
  }

  function startIngestPolling() {
    if (state.ingestPollInterval) {
      clearInterval(state.ingestPollInterval);
    }
    state.ingestPollInterval = setInterval(async () => {
      try {
        const jobStatus = await api('/api/ingest/status');
        if (!jobStatus) return;
        if (jobStatus.status === 'running') {
          setIngestRunningUI(true);
          const processed = jobStatus.processed_count || 0;
          const total = jobStatus.total_count || 0;
          const pct = total > 0 ? Math.min(95, Math.round((processed / total) * 100)) : 12;
          if (DOM.ingestProgressBar) {
            DOM.ingestProgressBar.style.width = `${pct}%`;
          }
          if (DOM.ingestProgressCount) {
            DOM.ingestProgressCount.textContent = total > 0 ? `${processed} / ${total}` : `${processed} processed`;
          }
          if (DOM.ingestProgressLabel) {
            DOM.ingestProgressLabel.textContent =
              jobStatus.message ||
              (jobStatus.current_post ? `Processing: ${jobStatus.current_post}` : 'Ingesting articles...');
          }
        } else if (jobStatus.status === 'success') {
          clearInterval(state.ingestPollInterval);
          state.ingestPollInterval = null;
          setIngestRunningUI(false, '✅ Ingestion Completed Successfully!');
          if (DOM.ingestProgressBar) {
            DOM.ingestProgressBar.style.width = '100%';
          }
          if (DOM.ingestProgressCount) {
            DOM.ingestProgressCount.textContent = `${jobStatus.processed_count || 0} / ${jobStatus.total_count || 0}`;
          }

          const counts = jobStatus.counts || {};
          if (DOM.diffNewCount) DOM.diffNewCount.textContent = counts.new || 0;
          if (DOM.diffUpdatedCount) DOM.diffUpdatedCount.textContent = counts.updated || 0;
          if (DOM.diffSyncedCount) DOM.diffSyncedCount.textContent = counts.synced || 0;
          if (DOM.diffResultsBox) DOM.diffResultsBox.style.display = 'block';
          if (DOM.diffSummaryTableBody) {
            DOM.diffSummaryTableBody.innerHTML = '';
            (jobStatus.new_posts || []).forEach((p) => addDiffRowGlobal(p.slug, p.title, 'NEW', 'badge-new'));
            (jobStatus.updated_posts || []).forEach((p) => addDiffRowGlobal(p.slug, p.title, 'UPDATED', 'badge-updated'));
            (jobStatus.synced_posts || []).forEach((p) => addDiffRowGlobal(p.slug, p.title, 'SYNCED', 'badge-synced'));
          }
          showToast(`Ingestion finished: ${counts.total || jobStatus.processed_count || 0} total posts processed.`, 'success');
          appendTerminalLog(`Ingested: ${counts.new || 0} new, ${counts.updated || 0} updated, ${counts.synced || 0} synced.`, 'success');
          await refreshSystem();
          await refreshPosts();
          await loadProjects();
        } else if (jobStatus.status === 'stopped') {
          clearInterval(state.ingestPollInterval);
          state.ingestPollInterval = null;
          setIngestRunningUI(false, `⏹️ ${jobStatus.message || 'Ingestion stopped by user.'}`);
          showToast(jobStatus.message || 'Ingestion stopped by user.', 'warning');
          appendTerminalLog(`[INGEST STOPPED] ${jobStatus.message || 'Stopped by user.'}`, 'warning');
        } else if (jobStatus.status === 'error') {
          clearInterval(state.ingestPollInterval);
          state.ingestPollInterval = null;
          setIngestRunningUI(false, `❌ Ingestion error: ${jobStatus.error || jobStatus.message || 'Unknown error'}`);
          showToast(`Ingestion error: ${jobStatus.error || jobStatus.message}`, 'error');
          appendTerminalLog(`[INGEST ERROR] ${jobStatus.error || jobStatus.message}`, 'error');
        } else {
          clearInterval(state.ingestPollInterval);
          state.ingestPollInterval = null;
          setIngestRunningUI(false);
        }
      } catch (pollErr) {
        console.warn('Error polling ingest status:', pollErr);
      }
    }, 800);
  }

  async function syncActiveIngestJobUI() {
    try {
      const jobStatus = await api('/api/ingest/status');
      if (jobStatus && jobStatus.status === 'running') {
        setIngestRunningUI(true, jobStatus.message || 'Ingesting articles...');
        if (DOM.ingestProgressCount && jobStatus.total_count > 0) {
          DOM.ingestProgressCount.textContent = `${jobStatus.processed_count || 0} / ${jobStatus.total_count}`;
        }
        startIngestPolling();
      } else {
        setIngestRunningUI(false);
      }
    } catch {
      // Ignore transient status error
    }
  }

  // Load GitHub Organizations List strictly based on token

  async function loadGithubAccounts(customToken = null) {
    const inputToken = (DOM.cfgGithubToken && DOM.cfgGithubToken.value || '').trim();
    const hasSavedToken = !!(state.config && state.config.github && (state.config.github.has_token || state.config.github.token));
    let tokenToSend = '';
    if (customToken && !customToken.includes('****')) {
      tokenToSend = customToken;
    } else if (inputToken && !inputToken.includes('****')) {
      tokenToSend = inputToken;
    }

    // Set loading indicator
    const selects = [DOM.cfgStep1GithubAccount, DOM.newProjGhOwnerSelect].filter(Boolean);
    selects.forEach(sel => {
      sel.innerHTML = '<option value="">🔄 Detecting organizations from token...</option>';
    });

    if (DOM.tokenStatusBadge) {
      DOM.tokenStatusBadge.textContent = '⏳ Verifying token...';
      DOM.tokenStatusBadge.style.color = '#38BDF8';
    }

    if (!tokenToSend && !hasSavedToken) {
      selects.forEach(sel => {
        sel.innerHTML = '<option value="">⚠️ Enter GitHub Token in Settings to detect accounts</option>';
      });
      if (DOM.tokenStatusBadge) {
        DOM.tokenStatusBadge.textContent = '○ Token Not Configured';
        DOM.tokenStatusBadge.style.color = '#94A3B8';
      }
      if (DOM.step1GithubTokenDetectedBadge) {
        DOM.step1GithubTokenDetectedBadge.textContent = '○ Token Not Configured (Set in Settings)';
        DOM.step1GithubTokenDetectedBadge.style.color = '#F59E0B';
      }
      return;
    }
    try {
      const res = await api('/api/github/orgs', 'POST', { token: tokenToSend });
      if (res.success && res.accounts && res.accounts.length > 0) {
        const currentOwner = (DOM.cfgStep1GithubOwner && DOM.cfgStep1GithubOwner.value || '').trim();
        selects.forEach(sel => {
          sel.innerHTML = '<option value="">-- Choose an Organization or Account --</option>';
          res.accounts.forEach(acc => {
            const opt = document.createElement('option');
            opt.value = acc.login;
            opt.dataset.isOrg = acc.is_org ? 'true' : 'false';
            const icon = acc.is_org ? '🏢' : '👤';
            opt.textContent = `${icon} ${acc.login} (${acc.type})`;
            if (acc.login === currentOwner) {
              opt.selected = true;
            }
            sel.appendChild(opt);
          });
        });

        if (DOM.tokenStatusBadge) {
          DOM.tokenStatusBadge.textContent = `● Token Connected (${res.accounts.length} accounts detected)`;
          DOM.tokenStatusBadge.style.color = '#10B981';
        }
        if (DOM.step1GithubTokenDetectedBadge) {
          DOM.step1GithubTokenDetectedBadge.textContent = `● ${res.accounts.length} accounts detected from token`;
          DOM.step1GithubTokenDetectedBadge.style.color = '#10B981';
        }
        updateRootDomainPreview();
        return res.accounts;
      } else if (res.token_invalid) {
        selects.forEach(sel => {
          sel.innerHTML = '<option value="">❌ Invalid Token (401 Unauthorized)</option>';
        });
        if (DOM.tokenStatusBadge) {
          DOM.tokenStatusBadge.textContent = '✕ Invalid Token';
          DOM.tokenStatusBadge.style.color = '#EF4444';
        }
        if (DOM.step1GithubTokenDetectedBadge) {
          DOM.step1GithubTokenDetectedBadge.textContent = '✕ Invalid Token in Settings';
          DOM.step1GithubTokenDetectedBadge.style.color = '#EF4444';
        }
        return [];
      } else {
        selects.forEach(sel => {
          sel.innerHTML = '<option value="">No organizations found on token</option>';
        });
        if (DOM.tokenStatusBadge) {
          DOM.tokenStatusBadge.textContent = '● Connected (0 orgs)';
          DOM.tokenStatusBadge.style.color = '#10B981';
        }
        return [];
      }
    } catch (err) {
      console.warn('Failed to load GitHub accounts:', err);
      selects.forEach(sel => {
        sel.innerHTML = '<option value="">⚠️ Could not detect accounts</option>';
      });
      return [];
    }
  }

  function populateCategoryFilter() {
    const q = DOM.postSearchInput ? DOM.postSearchInput.value.trim() : '';
    const current = DOM.postCategoryFilter ? DOM.postCategoryFilter.value : '';
    const statusFilter = DOM.postStatusFilter ? DOM.postStatusFilter.value : '';
    const isUnfiltered = !q && !current && !statusFilter;

    // Refresh master category index when unfiltered or when switching projects
    if (isUnfiltered || state.allCategoriesProject !== state.activeProject || state.allCategories.length === 0) {
      const counts = new Map();
      state.posts.forEach((p) => {
        const catName = (p.category || 'General').trim();
        if (catName) counts.set(catName, (counts.get(catName) || 0) + 1);
      });
      state.allCategories = Array.from(counts.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, count]) => ({ name, count }));
      state.allCategoriesProject = state.activeProject;
    }

    if (DOM.postCategoryFilter) {
      DOM.postCategoryFilter.innerHTML = '<option value="">All Categories</option>';
      state.allCategories.forEach(({ name }) => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        if (name === current) opt.selected = true;
        DOM.postCategoryFilter.appendChild(opt);
      });
    }

    // Render 1-click category quick-filter buttons
    if (DOM.catalogCategoryPills) {
      DOM.catalogCategoryPills.innerHTML = '';
      if (state.allCategories.length > 0) {
        const totalCount = state.allCategories.reduce((acc, item) => acc + item.count, 0);
        const allBtn = document.createElement('button');
        allBtn.type = 'button';
        allBtn.className = `cat-pill-btn${current === '' ? ' active' : ''}`;
        allBtn.setAttribute('data-cat', '');
        allBtn.innerHTML = `<span>All Categories</span><span class="cat-pill-count">${totalCount}</span>`;
        allBtn.addEventListener('click', () => {
          DOM.postCategoryFilter.value = '';
          refreshPosts();
        });
        DOM.catalogCategoryPills.appendChild(allBtn);

        state.allCategories.forEach(({ name, count }) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `cat-pill-btn${current === name ? ' active' : ''}`;
          btn.setAttribute('data-cat', name);
          btn.innerHTML = `<span>${escapeHtml(name)}</span><span class="cat-pill-count">${count}</span>`;
          btn.addEventListener('click', () => {
            DOM.postCategoryFilter.value = name;
            refreshPosts();
          });
          DOM.catalogCategoryPills.appendChild(btn);
        });
      }
    }
  }

  // Populate Preview Select

  function populatePreviewSelect() {
    const current = DOM.previewPostSelect.value || state.selectedPostSlug;
    DOM.previewPostSelect.innerHTML = '';

    // Always provide Front / Homepage Hub as top option so magazine hubs can be previewed immediately
    const hubOpt = document.createElement('option');
    hubOpt.value = '__hub__';
    hubOpt.textContent = '🏛️ Front / Homepage Hub (Model 1 Kinfolk Journal)';
    DOM.previewPostSelect.appendChild(hubOpt);

    // Live Sample Template Post
    const sampleOpt = document.createElement('option');
    sampleOpt.value = '__sample__';
    sampleOpt.textContent = '⭐ Sample Template Post (Scandinavian Room Styling & Checklist)';
    DOM.previewPostSelect.appendChild(sampleOpt);
    state.posts.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.slug;
      opt.textContent = `${p.title} (${p.category || 'General'})`;
      if (p.slug === current) {
        opt.selected = true;
      }
      DOM.previewPostSelect.appendChild(opt);
    });

    const currentExists =
      current === '__hub__' ||
      current === '__sample__' ||
      (current && state.posts.some((p) => p.slug === current));

    if (currentExists) {
      DOM.previewPostSelect.value = current;
      state.selectedPostSlug = current;
    } else if (state.posts.length > 0) {
      DOM.previewPostSelect.value = state.posts[0].slug;
      state.selectedPostSlug = state.posts[0].slug;
    } else {
      DOM.previewPostSelect.value = '__sample__';
      state.selectedPostSlug = '__sample__';
    }

    if (DOM.previewLiveTitle) {
      if (state.selectedPostSlug === '__sample__') {
        DOM.previewLiveTitle.value = 'Modern Scandinavian Living Room Design: 15 Warm Minimalist Ideas';
      } else if (state.selectedPostSlug === '__hub__') {
        DOM.previewLiveTitle.value =
          (state.config?.branding?.brand_name || 'Anna Deco') + ' — Editorial Homepage Hub';
      } else if (state.selectedPostSlug) {
        const post = state.posts.find((p) => p.slug === state.selectedPostSlug);
        if (post) {
          DOM.previewLiveTitle.value = post.title || '';
        }
      }
    }
  }

  // Refresh Posts Catalog
  async function refreshPosts() {
    try {
      const q = DOM.postSearchInput ? DOM.postSearchInput.value.trim() : '';
      const cat = DOM.postCategoryFilter ? DOM.postCategoryFilter.value : '';
      const statusFilter = DOM.postStatusFilter ? DOM.postStatusFilter.value : '';
      const customOnly = statusFilter === 'CUSTOM';
      const res = await api(
        `/api/posts?q=${encodeURIComponent(q)}&category=${encodeURIComponent(cat)}&custom_only=${customOnly}&status=${encodeURIComponent(statusFilter)}`
      );
      state.posts = res.posts || [];
      renderPostsTable();
      populateCategoryFilter();
      populatePreviewSelect();
      refreshStaticPages();
    } catch (err) {
      showToast(`Error fetching posts: ${err.message}`, 'error');
    }
  }

  // Render Posts Catalog Table

  function renderPostsTable() {
    if (DOM.catalogPostsCountTag) {
      const count = state.posts.length;
      DOM.catalogPostsCountTag.textContent = `${count} ${count === 1 ? 'post' : 'posts'}`;
    }
    DOM.postsCatalogBody.innerHTML = '';
    if (state.posts.length === 0) {
      DOM.postsCatalogBody.innerHTML = `

        <tr>

          <td colspan="7" style="text-align: center; padding: 2.5rem; color: var(--text-secondary);">

            No matching posts found. Ingest content from the "Ingestion & Manifest" tab.

          </td>

        </tr>`;
      return;
    }
    state.posts.forEach((post) => {
      const tr = document.createElement('tr');
      const badgeClass = post.custom_edited ? 'badge-custom' : 'badge-synced';
      const badgeText = post.custom_edited ? 'CUSTOM' : 'SYNCED';
      const fallbackThumb = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='44' height='30'><rect width='44' height='30' fill='%23334155'/></svg>";
      const rawThumb = post.local_image_path || post.image_url || fallbackThumb;
      const thumb = toSpaceAssetUrl(rawThumb);
      tr.innerHTML = `

        <td><span class="badge ${badgeClass}">${badgeText}</span></td>

        <td>

          <img src="${escapeHtml(thumb)}" alt="" style="width: 44px; height: 30px; object-fit: cover; border-radius: 4px; background: #334155;" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'44\\' height=\\'30\\'><rect width=\\'44\\' height=\\'30\\' fill=\\'%23334155\\'/></svg>'">

        </td>

        <td>

          <div style="font-weight: 600; color: var(--text-primary);">${escapeHtml(post.title)}</div>

          <div style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-muted);">${escapeHtml(post.slug)}</div>

        </td>

        <td style="white-space: nowrap;"><span class="badge" style="background: rgba(255,255,255,0.08); white-space: nowrap;">${escapeHtml(post.category || 'General')}</span></td>

        <td style="font-size: 0.75rem; color: var(--text-secondary); white-space: nowrap;">${(post.modified || post.date || '').slice(0, 10)}</td>

        <td style="white-space: nowrap;">${post.custom_edited ? '✅ Yes' : '—'}</td>

        <td style="white-space: nowrap;">

          <div class="catalog-row-actions">

            <button type="button" class="btn btn-secondary btn-sm edit-btn" data-slug="${escapeHtml(post.slug)}">✏️ Edit Text</button>

            <button type="button" class="btn btn-secondary btn-sm preview-btn" data-slug="${escapeHtml(post.slug)}">👁️ Preview</button>

            <button type="button" class="btn btn-danger-outline btn-sm delete-post-btn" data-slug="${escapeHtml(post.slug)}" title="Delete post from catalog and remove directly from live Worker without full redeploy">🗑️ Delete</button>

          </div>

        </td>

      `;
      tr.querySelector('.edit-btn').addEventListener('click', () => openEditModal(post.slug));
      tr.querySelector('.preview-btn').addEventListener('click', () => {
        state.selectedPostSlug = post.slug;
        DOM.previewPostSelect.value = post.slug;
        switchTab('tab-preview');
      });

      const delBtn = tr.querySelector('.delete-post-btn');
      let confirmResetTimer = null;
      delBtn.addEventListener('click', () => {
        if (!delBtn.classList.contains('confirming')) {
          delBtn.classList.add('confirming');
          delBtn.textContent = '⚠️ Confirm?';
          confirmResetTimer = setTimeout(() => {
            delBtn.classList.remove('confirming');
            delBtn.textContent = '🗑️ Delete';
          }, 4500);
          return;
        }
        if (confirmResetTimer) clearTimeout(confirmResetTimer);
        delBtn.classList.remove('confirming');
        handleDeletePostFromCatalog(post.slug, delBtn);
      });

      DOM.postsCatalogBody.appendChild(tr);
    });

  }

  function setCatalogWorkerStatus(type, message, liveUrl = '') {
    if (!DOM.catalogWorkerStatus) return;
    if (!type) {
      DOM.catalogWorkerStatus.style.display = 'none';
      DOM.catalogWorkerStatus.className = 'catalog-worker-status';
      DOM.catalogWorkerStatus.innerHTML = '';
      return;
    }
    DOM.catalogWorkerStatus.style.display = 'flex';
    DOM.catalogWorkerStatus.className = `catalog-worker-status ${type}`;
    const safeLink =
      liveUrl && /^https?:\/\//i.test(liveUrl)
        ? `<a href="${escapeHtml(liveUrl)}" target="_blank" rel="noopener noreferrer" class="rte-deploy-link">Open Live Worker ↗</a>`
        : '';
    DOM.catalogWorkerStatus.innerHTML = `<span>${escapeHtml(message)}</span>${safeLink}`;
  }

  async function handleFetchWorkerPosts() {
    const origHtml = DOM.fetchWorkerPostsBtn ? DOM.fetchWorkerPostsBtn.innerHTML : '☁️ Fetch All Worker Posts';
    const workerSubdomain = (DOM.cfgCfProjectName && DOM.cfgCfProjectName.value.trim()) || '';

    try {
      if (DOM.fetchWorkerPostsBtn) {
        DOM.fetchWorkerPostsBtn.disabled = true;
        DOM.fetchWorkerPostsBtn.textContent = '⏳ Fetching Live Posts...';
      }
      setCatalogWorkerStatus('loading', '⏳ Discovering & fetching all live posts published inside your Cloudflare Worker...');
      appendTerminalLog('[CLOUDFLARE] Fetching all live posts from deployed Cloudflare Worker...', 'info');

      const res = await api('/api/cloudflare/fetch-posts', 'POST', {
        subdomain: workerSubdomain || undefined,
      });

      const summary = `✅ Loaded ${res.total_live_posts} live post(s) from Worker (${res.newly_imported} newly imported, ${res.already_local} already in catalog · ${res.total_catalog_posts} total).`;
      setCatalogWorkerStatus('success', summary, res.worker_url || '');
      showToast(summary, 'success');
      appendTerminalLog(`[CLOUDFLARE] ${res.message || summary}`, 'success');

      state.allCategories = [];
      await refreshSystem();
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      setCatalogWorkerStatus('error', `❌ Failed to fetch Worker posts: ${msg}`);
      showToast(`Fetch Worker posts failed: ${msg}`, 'error');
      appendTerminalLog(`[CLOUDFLARE ERROR] ${msg}`, 'error');
    } finally {
      if (DOM.fetchWorkerPostsBtn) {
        DOM.fetchWorkerPostsBtn.disabled = false;
        DOM.fetchWorkerPostsBtn.innerHTML = origHtml;
      }
    }
  }

  async function handleDeletePostFromCatalog(slug, btnEl) {
    const activePlatform = currentPlatformMode === 'github' ? 'github' : 'cloudflare';
    const isDryRun =
      activePlatform === 'github'
        ? Boolean(DOM.deployDryRun && DOM.deployDryRun.checked)
        : Boolean(DOM.deployCfDryRun && DOM.deployCfDryRun.checked);

    try {
      if (btnEl) {
        btnEl.disabled = true;
        btnEl.textContent = '⏳ Deleting...';
      }
      setCatalogWorkerStatus(
        'loading',
        `⏳ Removing '${slug}' from catalog and live ${activePlatform === 'github' ? 'GitHub Pages' : 'Cloudflare Worker'} without full redeploy...`
      );
      appendTerminalLog(`[POST DELETE] Removing '${slug}' directly from ${activePlatform}...`, 'info');

      const res = await api(`/api/posts/${encodeURIComponent(slug)}`, 'DELETE', {
        platform: activePlatform,
        dry_run: isDryRun,
        remove_from_worker: true,
      });

      const summary = res.dry_run
        ? `✅ [DRY-RUN] Deleted '${slug}' locally (${res.remaining_posts} posts left, no full rebuild).`
        : res.removed_from_worker
          ? `✅ Removed '${slug}' directly from live ${activePlatform === 'github' ? 'GitHub' : 'Cloudflare Worker'} (${res.remaining_posts} posts remaining · ${res.cached_files || 0} unchanged cached on edge).`
          : `✅ Deleted '${slug}' from local catalog (${res.remaining_posts} posts remaining).`;

      setCatalogWorkerStatus('success', summary, res.live_url || '');
      showToast(summary, 'success');
      appendTerminalLog(`[POST DELETE] ${res.message || summary}`, 'success');

      state.allCategories = [];
      await refreshSystem();
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      setCatalogWorkerStatus('error', `❌ Delete failed for '${slug}': ${msg}`);
      showToast(`Delete failed: ${msg}`, 'error');
      appendTerminalLog(`[POST DELETE ERROR] ${msg}`, 'error');
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.textContent = '🗑️ Delete';
      }
    }
  }

  // ─── Rich Text Post Editor Helpers ─────────────────────────────────────────
  function sanitizeSafeEditorUrl(rawUrl) {
    const trimmed = String(rawUrl || '').trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) return `https://${trimmed}`;
    return '';
  }

  function updateEditorWordCount() {
    if (!DOM.editorWordCount) return;
    let plainText = '';
    if (state.editorMode === 'source' && DOM.editPostHtmlSource) {
      const temp = document.createElement('div');
      temp.innerHTML = DOM.editPostHtmlSource.value || '';
      plainText = (temp.textContent || '').trim();
    } else if (DOM.editPostRichEditor) {
      plainText = (DOM.editPostRichEditor.innerText || DOM.editPostRichEditor.textContent || '').trim();
    }
    const words = plainText ? plainText.split(/\s+/).filter(Boolean).length : 0;
    const chars = plainText.length;
    DOM.editorWordCount.textContent = `${words} words · ${chars} chars`;
  }

  function setEditorMode(mode) {
    if (!DOM.editPostRichEditor || !DOM.editPostHtmlSource) return;
    closeRteInlineBar();

    if (mode === 'source') {
      if (state.editorMode !== 'source') {
        DOM.editPostHtmlSource.value = DOM.editPostRichEditor.innerHTML;
      }
      state.editorMode = 'source';
      DOM.editPostRichEditor.style.display = 'none';
      DOM.editPostHtmlSource.style.display = 'block';
      DOM.btnEditorVisual?.classList.remove('active');
      DOM.btnEditorSource?.classList.add('active');
      if (DOM.rteToolbar) {
        DOM.rteToolbar.querySelectorAll('.rte-btn').forEach((b) => { b.disabled = true; });
      }
    } else {
      if (state.editorMode === 'source') {
        DOM.editPostRichEditor.innerHTML = DOM.editPostHtmlSource.value;
      }
      state.editorMode = 'visual';
      DOM.editPostHtmlSource.style.display = 'none';
      DOM.editPostRichEditor.style.display = 'block';
      DOM.btnEditorSource?.classList.remove('active');
      DOM.btnEditorVisual?.classList.add('active');
      if (DOM.rteToolbar) {
        DOM.rteToolbar.querySelectorAll('.rte-btn').forEach((b) => { b.disabled = false; });
      }
    }
    updateEditorWordCount();
  }

  function saveEditorSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && DOM.editPostRichEditor?.contains(sel.anchorNode)) {
      state.rteSavedRange = sel.getRangeAt(0).cloneRange();
    } else {
      state.rteSavedRange = null;
    }
  }

  function restoreEditorSelection() {
    if (!DOM.editPostRichEditor) return;
    DOM.editPostRichEditor.focus();
    if (state.rteSavedRange) {
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(state.rteSavedRange);
      }
    }
  }

  function openRteInlineBar(action) {
    if (!DOM.rteInlineBar) return;
    if (state.editorMode !== 'visual') setEditorMode('visual');
    saveEditorSelection();
    state.rteInlineAction = action;
    DOM.rteInlineBar.style.display = 'flex';
    if (action === 'link') {
      DOM.rteInlineLabel.textContent = 'Insert Link';
      DOM.rteInlineUrl.placeholder = 'https://example.com or /about/';
      DOM.rteInlineText.placeholder = 'Link text (optional if text selected)';
      const selText = window.getSelection()?.toString() || '';
      DOM.rteInlineText.value = selText;
    } else {
      DOM.rteInlineLabel.textContent = 'Insert Image';
      DOM.rteInlineUrl.placeholder = '/assets/images/photo.webp or https://...';
      DOM.rteInlineText.placeholder = 'Image alt text...';
      DOM.rteInlineText.value = '';
    }
    DOM.rteInlineUrl.value = '';
    DOM.rteInlineUrl.focus();
  }

  function closeRteInlineBar() {
    if (!DOM.rteInlineBar) return;
    DOM.rteInlineBar.style.display = 'none';
    state.rteInlineAction = null;
  }

  function applyRteInlineBar() {
    const safeUrl = sanitizeSafeEditorUrl(DOM.rteInlineUrl?.value || '');
    if (!safeUrl) {
      showToast('Please enter a valid http(s):// or /assets/... URL.', 'error');
      return;
    }
    const labelText = (DOM.rteInlineText?.value || '').trim();
    restoreEditorSelection();

    if (state.rteInlineAction === 'link') {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) {
        document.execCommand('createLink', false, safeUrl);
      } else {
        const display = escapeHtml(labelText || safeUrl);
        document.execCommand(
          'insertHTML',
          false,
          `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${display}</a>`
        );
      }
    } else if (state.rteInlineAction === 'image') {
      const altAttr = escapeHtml(labelText || 'Article image');
      document.execCommand(
        'insertHTML',
        false,
        `<figure><img src="${escapeHtml(safeUrl)}" alt="${altAttr}" loading="lazy" /></figure><p></p>`
      );
    }

    closeRteInlineBar();
    updateEditorWordCount();
  }

  function updateHeadCodeStats() {
    if (!DOM.cfgCustomHeadCode) return;
    const raw = DOM.cfgCustomHeadCode.value || '';
    const trimmed = raw.trim();
    const lines = trimmed ? trimmed.split(/\r?\n/).length : 0;
    const chars = trimmed.length;
    if (DOM.headCodeMetrics) {
      DOM.headCodeMetrics.textContent = `${lines} ${lines === 1 ? 'line' : 'lines'} · ${chars} chars`;
    }
    if (DOM.headCodeStatusTag) {
      if (chars > 0) {
        DOM.headCodeStatusTag.textContent = `${lines}L Active`;
        DOM.headCodeStatusTag.classList.add('has-code');
      } else {
        DOM.headCodeStatusTag.textContent = 'Empty';
        DOM.headCodeStatusTag.classList.remove('has-code');
      }
    }
  }

  async function refreshHeadCodePreview() {
    if (!DOM.headOutputPreview) return;
    try {
      const res = await api('/api/preview', 'POST', { view_mode: 'hub' });
      const html = String((res && res.html) || '');
      const headMatch = html.match(/<head>[\s\S]*?<\/head>/i);
      if (!headMatch) {
        DOM.headOutputPreview.textContent = 'Unable to inspect generated <head>.';
        return;
      }
      const headBlock = headMatch[0];
      const styleIdx = headBlock.search(/<style\b/i);
      const compactHead =
        styleIdx >= 0
          ? `${headBlock.slice(0, styleIdx).trimEnd()}\n  <style>/* ... theme CSS ... */</style>\n</head>`
          : headBlock;
      DOM.headOutputPreview.textContent = compactHead;

      if (DOM.headOutputVerifyBadge) {
        const hasInjected = headBlock.includes('<!-- Custom Header Code -->');
        const beforeStyle =
          hasInjected && (styleIdx < 0 || headBlock.indexOf('<!-- Custom Header Code -->') < styleIdx);
        if (beforeStyle) {
          DOM.headOutputVerifyBadge.textContent = '✓ Active at top of <head>';
          DOM.headOutputVerifyBadge.style.color = '#34D399';
        } else if (hasInjected) {
          DOM.headOutputVerifyBadge.textContent = '✓ Active inside <head>';
          DOM.headOutputVerifyBadge.style.color = '#34D399';
        } else {
          DOM.headOutputVerifyBadge.textContent = 'No custom code active';
          DOM.headOutputVerifyBadge.style.color = '#94A3B8';
        }
      }
    } catch {
      DOM.headOutputPreview.textContent = 'Save your header code to inspect the generated homepage <head>.';
    }
  }

  function initModelsSubtabsAndHeadCode() {
    const subtabBtns = document.querySelectorAll('.models-subtab-btn[data-subpanel]');
    subtabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-subpanel');
        if (!targetId) return;
        subtabBtns.forEach((b) => {
          const isMatch = b === btn;
          b.classList.toggle('active', isMatch);
          b.setAttribute('aria-selected', isMatch ? 'true' : 'false');
        });
        document.querySelectorAll('.models-subpanel').forEach((panel) => {
          panel.classList.toggle('active', panel.id === targetId);
        });
        if (targetId === 'modelsSubpanelHeadCode') {
          refreshHeadCodePreview();
        }
      });
    });

    if (DOM.cfgCustomHeadCode) {
      DOM.cfgCustomHeadCode.addEventListener('input', updateHeadCodeStats);
      updateHeadCodeStats();
    }

    const SNIPPETS = {
      ga4: `<!-- Google Analytics (GA4) -->\n<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>\n<script>\n  window.dataLayer = window.dataLayer || [];\n  function gtag(){dataLayer.push(arguments);}\n  gtag('js', new Date());\n  gtag('config', 'G-XXXXXXXXXX');\n</script>`,
      gsc: `<!-- Google Search Console Verification -->\n<meta name="google-site-verification" content="YOUR_VERIFICATION_TOKEN" />`,
      pinterest: `<!-- Pinterest Domain Verification -->\n<meta name="p:domain_verify" content="YOUR_PINTEREST_CODE" />`,
      custom_js: `<!-- Custom Script -->\n<script defer>\n  // Your custom JavaScript code here\n</script>`,
    };

    document.querySelectorAll('.head-snippet-btn[data-snippet]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!DOM.cfgCustomHeadCode) return;
        const key = btn.getAttribute('data-snippet');
        const snippet = key && SNIPPETS[key];
        if (!snippet) return;
        const current = DOM.cfgCustomHeadCode.value.trim();
        DOM.cfgCustomHeadCode.value = current ? `${current}\n\n${snippet}` : snippet;
        updateHeadCodeStats();
        DOM.cfgCustomHeadCode.focus();
      });
    });

    if (DOM.btnClearHeadCode) {
      DOM.btnClearHeadCode.addEventListener('click', () => {
        if (!DOM.cfgCustomHeadCode) return;
        DOM.cfgCustomHeadCode.value = '';
        updateHeadCodeStats();
        showToast('Header code cleared. Click Save Header Code to apply.', 'info');
      });
    }

    if (DOM.btnSaveHeadCode) {
      DOM.btnSaveHeadCode.addEventListener('click', async () => {
        const code = DOM.cfgCustomHeadCode ? DOM.cfgCustomHeadCode.value.trim() : '';
        const prevText = DOM.btnSaveHeadCode.textContent;
        DOM.btnSaveHeadCode.disabled = true;
        DOM.btnSaveHeadCode.textContent = 'Saving...';
        try {
          await api('/api/config', 'POST', {
            branding: {
              custom_head_code: code,
            },
          });
          updateHeadCodeStats();
          showToast(
            code ? 'Custom <head> code saved. Build & Deploy in Step 4 to publish live.' : 'Custom <head> code cleared and saved.',
            'success'
          );
          appendTerminalLog(
            code
              ? `[HEAD CODE] Saved ${code.length} chars of custom <head> code for active project.`
              : '[HEAD CODE] Cleared custom <head> code for active project.',
            'success'
          );
          await refreshSystem();
          await refreshHeadCodePreview();
          triggerPreview();
        } catch (err) {
          showToast(`Failed saving header code: ${err.message}`, 'error');
        } finally {
          DOM.btnSaveHeadCode.disabled = false;
          DOM.btnSaveHeadCode.textContent = prevText;
        }
      });
    }
  }

  // =========================================================================
  // 03 CATALOG — SITE PAGES (9 LEGAL & COMPANY PAGES) UPLOAD, EDIT & 2-OPTION DEPLOY
  // =========================================================================
  let staticPagesCache = [];
  let staticPageEditorMode = 'visual'; // 'visual' | 'source' | 'preview'
  let pendingQuickUploadSlug = '';

  function setStaticPagesStatusBanner(msg, type = 'info', liveUrl = '') {
    if (!DOM.staticPagesDeployStatus) return;
    if (!msg) {
      DOM.staticPagesDeployStatus.style.display = 'none';
      DOM.staticPagesDeployStatus.innerHTML = '';
      return;
    }
    DOM.staticPagesDeployStatus.style.display = 'flex';
    DOM.staticPagesDeployStatus.className = `catalog-worker-status ${type}`;
    const safeLiveUrl = /^https?:\/\//i.test(String(liveUrl || '')) ? escapeHtml(liveUrl) : '';
    const linkHtml = safeLiveUrl
      ? ` <a href="${safeLiveUrl}" target="_blank" rel="noopener noreferrer" style="color:#7DD3FC;font-weight:600;text-decoration:underline;margin-left:0.5rem;">Open Live Page ↗</a>`
      : '';
    DOM.staticPagesDeployStatus.innerHTML = `<span>${escapeHtml(msg)}${linkHtml}</span>`;
  }

  function setStaticPageModalDeployStatus(msg, type = 'info', liveUrl = '') {
    if (!DOM.editStaticPageDeployStatus) return;
    if (!msg) {
      DOM.editStaticPageDeployStatus.style.display = 'none';
      DOM.editStaticPageDeployStatus.innerHTML = '';
      return;
    }
    DOM.editStaticPageDeployStatus.style.display = 'block';
    DOM.editStaticPageDeployStatus.className = `rte-deploy-status ${type}`;
    const safeLiveUrl = /^https?:\/\//i.test(String(liveUrl || '')) ? escapeHtml(liveUrl) : '';
    const linkHtml = safeLiveUrl
      ? ` <a href="${safeLiveUrl}" target="_blank" rel="noopener noreferrer" style="color:#7DD3FC;font-weight:600;text-decoration:underline;margin-left:0.4rem;">Open Live Page ↗</a>`
      : '';
    DOM.editStaticPageDeployStatus.innerHTML = `${escapeHtml(msg)}${linkHtml}`;
  }

  function updateStaticPageEditorWordCount() {
    if (!DOM.staticPageWordCount) return;
    const html = getStaticPageEditorHtml();
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const text = (tmp.textContent || '').replace(/\s+/g, ' ').trim();
    const words = text ? text.split(' ').filter(Boolean).length : 0;
    DOM.staticPageWordCount.textContent = `${words} words · ${html.length} chars`;
  }

  function getStaticPageEditorHtml() {
    if (staticPageEditorMode === 'source' && DOM.editStaticPageHtmlSource) {
      return DOM.editStaticPageHtmlSource.value || '';
    }
    if (DOM.editStaticPageRichEditor) {
      return DOM.editStaticPageRichEditor.innerHTML || '';
    }
    return DOM.editStaticPageHtmlSource ? DOM.editStaticPageHtmlSource.value || '' : '';
  }

  async function renderStaticPageModalPreview() {
    if (!DOM.editStaticPagePreviewIframe || !DOM.editStaticPageSlug) return;
    const slug = DOM.editStaticPageSlug.value;
    if (!slug) return;
    const bodyHtml = DOM.editStaticPageHtmlSource ? DOM.editStaticPageHtmlSource.value : getStaticPageEditorHtml();
    try {
      const res = await api(`/api/pages/${encodeURIComponent(slug)}/preview`, 'POST', {
        title: DOM.editStaticPageTitle ? DOM.editStaticPageTitle.value.trim() : '',
        description: DOM.editStaticPageDescription ? DOM.editStaticPageDescription.value.trim() : '',
        body_html: bodyHtml,
      });
      if (res && res.html) {
        DOM.editStaticPagePreviewIframe.srcdoc = res.html;
      }
    } catch (err) {
      showToast(`Preview failed: ${err.message}`, 'error');
    }
  }

  function setStaticPageEditorMode(mode) {
    const prevMode = staticPageEditorMode;
    // Sync current edits before switching
    if (prevMode === 'visual' && DOM.editStaticPageRichEditor && DOM.editStaticPageHtmlSource) {
      DOM.editStaticPageHtmlSource.value = DOM.editStaticPageRichEditor.innerHTML;
    } else if (prevMode === 'source' && DOM.editStaticPageRichEditor && DOM.editStaticPageHtmlSource) {
      DOM.editStaticPageRichEditor.innerHTML = DOM.editStaticPageHtmlSource.value;
    }

    staticPageEditorMode = mode;
    if (DOM.btnStaticPageVisual) DOM.btnStaticPageVisual.classList.toggle('active', mode === 'visual');
    if (DOM.btnStaticPageSource) DOM.btnStaticPageSource.classList.toggle('active', mode === 'source');
    if (DOM.btnStaticPagePreview) DOM.btnStaticPagePreview.classList.toggle('active', mode === 'preview');

    if (DOM.staticPageRteToolbar) DOM.staticPageRteToolbar.style.display = mode === 'visual' ? 'flex' : 'none';
    if (DOM.editStaticPageRichEditor) DOM.editStaticPageRichEditor.style.display = mode === 'visual' ? 'block' : 'none';
    if (DOM.editStaticPageHtmlSource) DOM.editStaticPageHtmlSource.style.display = mode === 'source' ? 'block' : 'none';
    if (DOM.editStaticPagePreviewIframe) DOM.editStaticPagePreviewIframe.style.display = mode === 'preview' ? 'block' : 'none';

    updateStaticPageEditorWordCount();
    if (mode === 'preview') {
      renderStaticPageModalPreview();
    }
  }

  async function refreshStaticPages() {
    if (!DOM.staticPagesBody) return;
    try {
      const res = await api('/api/pages');
      staticPagesCache = Array.isArray(res.pages) ? res.pages : [];
      if (DOM.catalogPagesStatusTag) {
        const customCount = Number(res.custom_count || 0);
        DOM.catalogPagesStatusTag.textContent = `${customCount}/${staticPagesCache.length} Custom`;
        DOM.catalogPagesStatusTag.classList.toggle('has-code', customCount > 0);
      }
      renderStaticPagesTable();
    } catch (err) {
      DOM.staticPagesBody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:1.25rem;color:#FCA5A5;">Unable to load site pages: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function renderStaticPagesTable() {
    if (!DOM.staticPagesBody) return;
    DOM.staticPagesBody.innerHTML = '';
    if (!staticPagesCache.length) {
      DOM.staticPagesBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:1.5rem;color:var(--text-secondary);">No site pages found.</td></tr>';
      return;
    }

    staticPagesCache.forEach((page) => {
      const tr = document.createElement('tr');
      const badgeClass = page.is_custom ? 'badge-custom' : 'badge-synced';
      const badgeLabel = page.is_custom ? 'CUSTOM HTML' : 'DEFAULT';
      const updatedDisplay = page.updated_at ? String(page.updated_at).slice(0, 10) : 'Built-in';
      const safeDesc = (page.description || '').slice(0, 96);

      tr.innerHTML = `
        <td><span class="badge ${badgeClass}">${badgeLabel}</span></td>
        <td>
          <div style="font-weight: 600; color: #F8FAFC;">${escapeHtml(page.label)}</div>
          <code class="static-page-route-tag" style="margin-top: 0.2rem; display: inline-block;">${escapeHtml(page.web_path)}</code>
        </td>
        <td>
          <div style="font-size: 0.8rem; font-weight: 600; color: #E2E8F0;">${escapeHtml(page.title)}</div>
          <div style="font-size: 0.72rem; color: #94A3B8; margin-top: 0.12rem;">${escapeHtml(safeDesc)}</div>
        </td>
        <td style="font-size: 0.74rem; color: #CBD5E1; white-space: nowrap;">${page.word_count} words</td>
        <td style="font-size: 0.74rem; color: #94A3B8; white-space: nowrap;">${escapeHtml(updatedDisplay)}</td>
        <td>
          <div class="static-page-actions">
            <button type="button" class="btn btn-secondary btn-xs sp-upload-btn" data-slug="${escapeHtml(page.slug)}" title="Option 1: Upload an .html file for ${escapeHtml(page.label)}">⬆️ Upload HTML</button>
            <button type="button" class="btn btn-secondary btn-xs sp-view-btn" data-slug="${escapeHtml(page.slug)}" title="View live themed render of ${escapeHtml(page.label)}">👁️ View</button>
            <button type="button" class="btn btn-primary btn-xs sp-edit-btn" data-slug="${escapeHtml(page.slug)}" title="Option 2: Edit HTML/Visual content of ${escapeHtml(page.label)}">✏️ Edit</button>
            <button type="button" class="btn btn-deploy-cf btn-xs sp-deploy-cf-btn" data-slug="${escapeHtml(page.slug)}" title="Deploy ONLY ${escapeHtml(page.web_path)} directly to Cloudflare Edge">🟧 CF</button>
            <button type="button" class="btn btn-deploy-gh btn-xs sp-deploy-gh-btn" data-slug="${escapeHtml(page.slug)}" title="Push ONLY ${escapeHtml(page.web_path)} directly to GitHub Pages">🐙 GH</button>
          </div>
        </td>
      `;
      DOM.staticPagesBody.appendChild(tr);
    });

    DOM.staticPagesBody.querySelectorAll('.sp-upload-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        pendingQuickUploadSlug = btn.getAttribute('data-slug') || '';
        if (DOM.staticPageQuickFileInput && pendingQuickUploadSlug) {
          DOM.staticPageQuickFileInput.value = '';
          DOM.staticPageQuickFileInput.click();
        }
      });
    });

    DOM.staticPagesBody.querySelectorAll('.sp-view-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slug = btn.getAttribute('data-slug') || '';
        if (slug) openStaticPageModal(slug, 'preview');
      });
    });

    DOM.staticPagesBody.querySelectorAll('.sp-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slug = btn.getAttribute('data-slug') || '';
        if (slug) openStaticPageModal(slug, 'visual');
      });
    });

    DOM.staticPagesBody.querySelectorAll('.sp-deploy-cf-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slug = btn.getAttribute('data-slug') || '';
        if (slug) deployStaticPageDirect(slug, 'cloudflare', false, btn);
      });
    });

    DOM.staticPagesBody.querySelectorAll('.sp-deploy-gh-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slug = btn.getAttribute('data-slug') || '';
        if (slug) deployStaticPageDirect(slug, 'github', false, btn);
      });
    });
  }

  function closeStaticPageModal() {
    if (!DOM.staticPageEditModal) return;
    DOM.staticPageEditModal.classList.remove('active');
    setStaticPageModalDeployStatus('');
  }

  async function openStaticPageModal(slug, initialMode = 'visual') {
    if (!DOM.staticPageEditModal) return;
    try {
      const res = await api(`/api/pages/${encodeURIComponent(slug)}`);
      const page = res.page;
      if (!page) return;
      DOM.editStaticPageSlug.value = page.slug;
      DOM.modalStaticPageTitle.textContent = `Site Page: ${page.label}`;
      DOM.modalStaticPageRoute.textContent = page.web_path;
      if (DOM.modalStaticPageStatusBadge) {
        DOM.modalStaticPageStatusBadge.textContent = page.is_custom ? 'CUSTOM HTML' : 'DEFAULT';
        DOM.modalStaticPageStatusBadge.className = `badge ${page.is_custom ? 'badge-custom' : 'badge-synced'}`;
      }
      DOM.editStaticPageTitle.value = page.title || page.label;
      DOM.editStaticPageDescription.value = page.description || '';
      DOM.editStaticPageRichEditor.innerHTML = page.body_html || '';
      DOM.editStaticPageHtmlSource.value = page.body_html || '';
      setStaticPageModalDeployStatus('');
      staticPageEditorMode = 'visual';
      DOM.staticPageEditModal.classList.add('active');
      setStaticPageEditorMode(initialMode);
    } catch (err) {
      showToast(`Failed loading page '${slug}': ${err.message}`, 'error');
    }
  }

  async function uploadHtmlFileIntoStaticPage(slug, file, openModalAfter = false) {
    if (!slug || !file) return;
    try {
      const rawHtml = await file.text();
      if (!rawHtml.trim()) {
        showToast('The selected HTML file is empty.', 'error');
        return;
      }
      const res = await api(`/api/pages/${encodeURIComponent(slug)}`, 'PUT', {
        raw_html: rawHtml,
      });
      if (res && res.page) {
        showToast(`Uploaded '${file.name}' into /${slug}/ (${res.page.word_count} words).`, 'success');
        appendTerminalLog(`[SITE PAGE] Uploaded '${file.name}' into /${slug}/ (${res.page.char_count} chars).`, 'success');
        setStaticPagesStatusBanner(
          `Uploaded '${file.name}' to /${slug}/. Click 🟧 CF or 🐙 GH to deploy this page directly.`,
          'success'
        );
        await refreshStaticPages();
        if (openModalAfter && DOM.staticPageEditModal && DOM.staticPageEditModal.classList.contains('active')) {
          DOM.editStaticPageTitle.value = res.page.title || '';
          DOM.editStaticPageDescription.value = res.page.description || '';
          DOM.editStaticPageRichEditor.innerHTML = res.page.body_html || '';
          DOM.editStaticPageHtmlSource.value = res.page.body_html || '';
          if (DOM.modalStaticPageStatusBadge) {
            DOM.modalStaticPageStatusBadge.textContent = 'CUSTOM HTML';
            DOM.modalStaticPageStatusBadge.className = 'badge badge-custom';
          }
          updateStaticPageEditorWordCount();
          if (staticPageEditorMode === 'preview') {
            renderStaticPageModalPreview();
          }
        }
      }
    } catch (err) {
      showToast(`HTML upload failed: ${err.message}`, 'error');
    }
  }

  async function saveStaticPageFromModal(e) {
    if (e) e.preventDefault();
    const slug = DOM.editStaticPageSlug ? DOM.editStaticPageSlug.value : '';
    if (!slug) return;
    const bodyHtml =
      staticPageEditorMode === 'source'
        ? DOM.editStaticPageHtmlSource.value
        : staticPageEditorMode === 'visual'
          ? DOM.editStaticPageRichEditor.innerHTML
          : DOM.editStaticPageHtmlSource.value;
    try {
      const res = await api(`/api/pages/${encodeURIComponent(slug)}`, 'PUT', {
        title: DOM.editStaticPageTitle.value.trim(),
        description: DOM.editStaticPageDescription.value.trim(),
        body_html: bodyHtml,
      });
      if (res && res.page) {
        DOM.editStaticPageRichEditor.innerHTML = res.page.body_html;
        DOM.editStaticPageHtmlSource.value = res.page.body_html;
        if (DOM.modalStaticPageStatusBadge) {
          DOM.modalStaticPageStatusBadge.textContent = 'CUSTOM HTML';
          DOM.modalStaticPageStatusBadge.className = 'badge badge-custom';
        }
        updateStaticPageEditorWordCount();
        showToast(`Saved /${slug}/ page changes.`, 'success');
        setStaticPageModalDeployStatus(`Saved /${slug}/. Choose Deploy CF or Deploy GitHub to publish directly.`, 'success');
        await refreshStaticPages();
      }
    } catch (err) {
      showToast(`Save failed: ${err.message}`, 'error');
      setStaticPageModalDeployStatus(`Save failed: ${err.message}`, 'error');
    }
  }

  async function deployStaticPageDirect(slug, platform, fromModal = false, triggerBtn = null) {
    if (!slug) return;
    const label = platform === 'github' ? 'GitHub Pages' : 'Cloudflare Edge';
    const prevText = triggerBtn ? triggerBtn.textContent : '';
    if (triggerBtn) {
      triggerBtn.disabled = true;
      triggerBtn.textContent = 'Deploying...';
    }
    if (fromModal) {
      setStaticPageModalDeployStatus(`Saving & deploying /${slug}/ directly to ${label}...`, 'info');
    } else {
      setStaticPagesStatusBanner(`Deploying /${slug}/ directly to ${label}...`, 'info');
    }

    try {
      const payload = { platform };
      if (fromModal) {
        const bodyHtml =
          staticPageEditorMode === 'source'
            ? DOM.editStaticPageHtmlSource.value
            : staticPageEditorMode === 'visual'
              ? DOM.editStaticPageRichEditor.innerHTML
              : DOM.editStaticPageHtmlSource.value;
        payload.title = DOM.editStaticPageTitle.value.trim();
        payload.description = DOM.editStaticPageDescription.value.trim();
        payload.body_html = bodyHtml;
      }

      const res = await api(`/api/pages/${encodeURIComponent(slug)}/deploy`, 'POST', payload);
      const liveUrl = res.page_url || res.live_url || '';
      const msg = res.message || `Deployed /${slug}/ to ${label}.`;
      showToast(msg, 'success');
      appendTerminalLog(`[PAGE DEPLOY] ${msg}`, 'success');
      if (fromModal) {
        setStaticPageModalDeployStatus(msg, 'success', liveUrl);
        if (res.page && DOM.modalStaticPageStatusBadge) {
          DOM.modalStaticPageStatusBadge.textContent = res.page.is_custom ? 'CUSTOM HTML' : 'DEFAULT';
          DOM.modalStaticPageStatusBadge.className = `badge ${res.page.is_custom ? 'badge-custom' : 'badge-synced'}`;
        }
      } else {
        setStaticPagesStatusBanner(msg, 'success', liveUrl);
      }
      await refreshStaticPages();
    } catch (err) {
      const msg = `Deploy /${slug}/ to ${label} failed: ${err.message}`;
      showToast(msg, 'error');
      appendTerminalLog(`[PAGE DEPLOY ERROR] ${msg}`, 'error');
      if (fromModal) setStaticPageModalDeployStatus(msg, 'error');
      else setStaticPagesStatusBanner(msg, 'error');
    } finally {
      if (triggerBtn) {
        triggerBtn.disabled = false;
        triggerBtn.textContent = prevText;
      }
    }
  }

  async function deployAllStaticPagesDirect(platform, triggerBtn) {
    const label = platform === 'github' ? 'GitHub Pages' : 'Cloudflare Edge';
    const prevText = triggerBtn ? triggerBtn.textContent : '';
    if (triggerBtn) {
      triggerBtn.disabled = true;
      triggerBtn.textContent = 'Deploying all 9...';
    }
    setStaticPagesStatusBanner(`Rebuilding & deploying all 9 site pages to ${label}...`, 'info');
    try {
      const res = await api('/api/pages/deploy-all', 'POST', { platform });
      const liveUrl = res.page_url || res.live_url || '';
      const msg = res.message || `Deployed all 9 site pages to ${label}.`;
      showToast(msg, 'success');
      appendTerminalLog(`[PAGE DEPLOY] ${msg}`, 'success');
      setStaticPagesStatusBanner(msg, 'success', liveUrl);
      await refreshStaticPages();
    } catch (err) {
      const msg = `Deploy all pages to ${label} failed: ${err.message}`;
      showToast(msg, 'error');
      appendTerminalLog(`[PAGE DEPLOY ERROR] ${msg}`, 'error');
      setStaticPagesStatusBanner(msg, 'error');
    } finally {
      if (triggerBtn) {
        triggerBtn.disabled = false;
        triggerBtn.textContent = prevText;
      }
    }
  }

  function initCatalogStaticPages() {
    // Sub-tab switcher inside 03 Catalog
    const catalogSubtabs = document.querySelectorAll('.models-subtab-btn[data-catalog-panel]');
    catalogSubtabs.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-catalog-panel');
        if (!targetId) return;
        catalogSubtabs.forEach((b) => {
          const isMatch = b === btn;
          b.classList.toggle('active', isMatch);
          b.setAttribute('aria-selected', isMatch ? 'true' : 'false');
        });
        document.querySelectorAll('.catalog-subpanel').forEach((panel) => {
          panel.classList.toggle('active', panel.id === targetId);
        });
        if (targetId === 'catalogSubpanelPages') {
          refreshStaticPages();
        }
      });
    });

    // Quick row HTML file upload
    if (DOM.staticPageQuickFileInput) {
      DOM.staticPageQuickFileInput.addEventListener('change', async () => {
        const file = DOM.staticPageQuickFileInput.files && DOM.staticPageQuickFileInput.files[0];
        const slug = pendingQuickUploadSlug;
        pendingQuickUploadSlug = '';
        if (file && slug) {
          await uploadHtmlFileIntoStaticPage(slug, file, false);
        }
      });
    }

    // Modal HTML file upload
    if (DOM.modalStaticPageFileInput) {
      DOM.modalStaticPageFileInput.addEventListener('change', async () => {
        const file = DOM.modalStaticPageFileInput.files && DOM.modalStaticPageFileInput.files[0];
        const slug = DOM.editStaticPageSlug ? DOM.editStaticPageSlug.value : '';
        DOM.modalStaticPageFileInput.value = '';
        if (file && slug) {
          await uploadHtmlFileIntoStaticPage(slug, file, true);
        }
      });
    }

    // Reset to default button
    if (DOM.btnResetStaticPageDefault) {
      DOM.btnResetStaticPageDefault.addEventListener('click', async () => {
        const slug = DOM.editStaticPageSlug ? DOM.editStaticPageSlug.value : '';
        if (!slug) return;
        try {
          const res = await api(`/api/pages/${encodeURIComponent(slug)}`, 'PUT', { reset: true });
          if (res && res.page) {
            DOM.editStaticPageTitle.value = res.page.title || '';
            DOM.editStaticPageDescription.value = res.page.description || '';
            DOM.editStaticPageRichEditor.innerHTML = res.page.body_html || '';
            DOM.editStaticPageHtmlSource.value = res.page.body_html || '';
            if (DOM.modalStaticPageStatusBadge) {
              DOM.modalStaticPageStatusBadge.textContent = 'DEFAULT';
              DOM.modalStaticPageStatusBadge.className = 'badge badge-synced';
            }
            updateStaticPageEditorWordCount();
            if (staticPageEditorMode === 'preview') renderStaticPageModalPreview();
            showToast(`Restored built-in default template for /${slug}/.`, 'info');
            await refreshStaticPages();
          }
        } catch (err) {
          showToast(`Reset failed: ${err.message}`, 'error');
        }
      });
    }

    // Editor formatting buttons
    if (DOM.staticPageRteToolbar) {
      DOM.staticPageRteToolbar.querySelectorAll('.rte-btn[data-sp-cmd]').forEach((btn) => {
        btn.addEventListener('mousedown', (e) => e.preventDefault());
        btn.addEventListener('click', () => {
          if (staticPageEditorMode !== 'visual' || !DOM.editStaticPageRichEditor) return;
          DOM.editStaticPageRichEditor.focus();
          const cmd = btn.getAttribute('data-sp-cmd');
          const val = btn.getAttribute('data-sp-val') || null;
          if (cmd === 'formatBlock' && val) {
            document.execCommand('formatBlock', false, `<${val}>`);
          } else if (cmd) {
            document.execCommand(cmd, false, val);
          }
          updateStaticPageEditorWordCount();
        });
      });
    }

    if (DOM.editStaticPageRichEditor) {
      DOM.editStaticPageRichEditor.addEventListener('input', updateStaticPageEditorWordCount);
    }
    if (DOM.editStaticPageHtmlSource) {
      DOM.editStaticPageHtmlSource.addEventListener('input', updateStaticPageEditorWordCount);
    }

    if (DOM.btnStaticPageVisual) DOM.btnStaticPageVisual.addEventListener('click', () => setStaticPageEditorMode('visual'));
    if (DOM.btnStaticPageSource) DOM.btnStaticPageSource.addEventListener('click', () => setStaticPageEditorMode('source'));
    if (DOM.btnStaticPagePreview) DOM.btnStaticPagePreview.addEventListener('click', () => setStaticPageEditorMode('preview'));

    if (DOM.closeStaticPageModalBtn) DOM.closeStaticPageModalBtn.addEventListener('click', closeStaticPageModal);
    if (DOM.cancelStaticPageModalBtn) DOM.cancelStaticPageModalBtn.addEventListener('click', closeStaticPageModal);
    if (DOM.staticPageEditModal) {
      DOM.staticPageEditModal.addEventListener('click', (e) => {
        if (e.target === DOM.staticPageEditModal) closeStaticPageModal();
      });
    }
    if (DOM.editStaticPageForm) {
      DOM.editStaticPageForm.addEventListener('submit', saveStaticPageFromModal);
    }

    // Modal 2-option direct deploy buttons
    if (DOM.btnSaveDeployStaticPageCf) {
      DOM.btnSaveDeployStaticPageCf.addEventListener('click', () => {
        const slug = DOM.editStaticPageSlug ? DOM.editStaticPageSlug.value : '';
        if (slug) deployStaticPageDirect(slug, 'cloudflare', true, DOM.btnSaveDeployStaticPageCf);
      });
    }
    if (DOM.btnSaveDeployStaticPageGh) {
      DOM.btnSaveDeployStaticPageGh.addEventListener('click', () => {
        const slug = DOM.editStaticPageSlug ? DOM.editStaticPageSlug.value : '';
        if (slug) deployStaticPageDirect(slug, 'github', true, DOM.btnSaveDeployStaticPageGh);
      });
    }

    // Bulk 2-option deploy all 9 pages buttons
    if (DOM.btnDeployAllPagesCf) {
      DOM.btnDeployAllPagesCf.addEventListener('click', () => {
        deployAllStaticPagesDirect('cloudflare', DOM.btnDeployAllPagesCf);
      });
    }
    if (DOM.btnDeployAllPagesGh) {
      DOM.btnDeployAllPagesGh.addEventListener('click', () => {
        deployAllStaticPagesDirect('github', DOM.btnDeployAllPagesGh);
      });
    }
  }

  function initRichTextEditor() {
    if (DOM.rteToolbar) {
      DOM.rteToolbar.querySelectorAll('.rte-btn[data-cmd]').forEach((btn) => {
        btn.addEventListener('mousedown', (e) => e.preventDefault());
        btn.addEventListener('click', () => {
          if (state.editorMode !== 'visual' || !DOM.editPostRichEditor) return;
          DOM.editPostRichEditor.focus();
          const cmd = btn.getAttribute('data-cmd');
          const val = btn.getAttribute('data-val') || null;
          if (cmd === 'formatBlock' && val) {
            document.execCommand('formatBlock', false, `<${val}>`);
          } else if (cmd) {
            document.execCommand(cmd, false, val);
          }
          updateEditorWordCount();
        });
      });
    }

    if (DOM.btnRteLink) {
      DOM.btnRteLink.addEventListener('mousedown', (e) => e.preventDefault());
      DOM.btnRteLink.addEventListener('click', () => openRteInlineBar('link'));
    }

    if (DOM.btnRteImage) {
      DOM.btnRteImage.addEventListener('mousedown', (e) => e.preventDefault());
      DOM.btnRteImage.addEventListener('click', () => openRteInlineBar('image'));
    }

    if (DOM.btnRteInlineApply) {
      DOM.btnRteInlineApply.addEventListener('click', applyRteInlineBar);
    }

    if (DOM.btnRteInlineCancel) {
      DOM.btnRteInlineCancel.addEventListener('click', closeRteInlineBar);
    }

    if (DOM.rteInlineUrl) {
      DOM.rteInlineUrl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          applyRteInlineBar();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closeRteInlineBar();
        }
      });
    }

    if (DOM.btnEditorVisual) {
      DOM.btnEditorVisual.addEventListener('click', () => setEditorMode('visual'));
    }

    if (DOM.btnEditorSource) {
      DOM.btnEditorSource.addEventListener('click', () => setEditorMode('source'));
    }

    if (DOM.editPostRichEditor) {
      DOM.editPostRichEditor.addEventListener('input', updateEditorWordCount);
    }

    if (DOM.editPostHtmlSource) {
      DOM.editPostHtmlSource.addEventListener('input', updateEditorWordCount);
    }

    if (DOM.saveAndPreviewBtn) {
      DOM.saveAndPreviewBtn.addEventListener('click', (e) => handlePostSave(e, true));
    }

    if (DOM.saveAndDeployPostBtn) {
      DOM.saveAndDeployPostBtn.addEventListener('click', () => handlePostSaveAndDeploy());
    }
  }

  function setEditPostDeployStatus(type, message, liveUrl = '') {
    if (!DOM.editPostDeployStatus) return;
    if (!type) {
      DOM.editPostDeployStatus.style.display = 'none';
      DOM.editPostDeployStatus.className = 'rte-deploy-status';
      DOM.editPostDeployStatus.innerHTML = '';
      return;
    }
    DOM.editPostDeployStatus.style.display = 'flex';
    DOM.editPostDeployStatus.className = `rte-deploy-status ${type}`;
    const safeLink =
      liveUrl && /^https?:\/\//i.test(liveUrl)
        ? `<a href="${escapeHtml(liveUrl)}" target="_blank" rel="noopener noreferrer" class="rte-deploy-link">Open Live Post ↗</a>`
        : '';
    DOM.editPostDeployStatus.innerHTML = `<span>${escapeHtml(message)}</span>${safeLink}`;
  }

  function closePostEditModal() {
    closeRteInlineBar();
    setEditPostDeployStatus(null, '');
    DOM.postEditModal.classList.remove('active');
  }

  // Open Edit Modal
  async function openEditModal(slug) {
    try {
      const post = await api(`/api/posts/${encodeURIComponent(slug)}`);
      DOM.editPostSlug.value = post.slug;
      DOM.modalPostSlugTitle.textContent = `Edit Post: ${post.slug}`;
      if (DOM.modalPostCatBadge) {
        DOM.modalPostCatBadge.textContent = post.category || 'General';
      }
      DOM.editPostTitle.value = post.title || '';
      if (DOM.editPostExcerpt) {
        DOM.editPostExcerpt.value = post.excerpt || '';
      }
      DOM.editPostCategory.value = post.category || '';
      DOM.editPostParentSlug.value = post.parent_slug || '';

      const initialHtml =
        (post.content_html && post.content_html.trim()) ||
        (post.excerpt ? `<p>${escapeHtml(post.excerpt)}</p>` : '<p></p>');

      if (DOM.editPostRichEditor) {
        DOM.editPostRichEditor.innerHTML = initialHtml;
      }
      if (DOM.editPostHtmlSource) {
        DOM.editPostHtmlSource.value = initialHtml;
      }
      setEditorMode('visual');
      updateEditorWordCount();
      setEditPostDeployStatus(null, '');
      DOM.postEditModal.classList.add('active');
    } catch (err) {
      showToast(`Failed loading post: ${err.message}`, 'error');
    }
  }

  // Save Modal Post
  async function handlePostSave(e, openPreviewAfter = false) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    const slug = DOM.editPostSlug.value;
    const title = DOM.editPostTitle.value.trim();
    const excerpt = DOM.editPostExcerpt ? DOM.editPostExcerpt.value.trim() : '';
    const category = DOM.editPostCategory.value.trim();
    const parent_slug = DOM.editPostParentSlug.value.trim();
    const content_html =
      state.editorMode === 'source'
        ? (DOM.editPostHtmlSource ? DOM.editPostHtmlSource.value : '')
        : (DOM.editPostRichEditor ? DOM.editPostRichEditor.innerHTML : '');

    if (!title) {
      showToast('Post headline is required.', 'error');
      return;
    }

    try {
      if (DOM.savePostBtn) DOM.savePostBtn.disabled = true;
      await api(`/api/posts/${encodeURIComponent(slug)}`, 'PUT', {
        title,
        excerpt,
        category,
        parent_slug,
        content_html,
      });

      closePostEditModal();
      showToast(`Saved changes for '${slug}' (marked custom edited)`, 'success');
      state.allCategories = [];
      await refreshSystem();
      if (openPreviewAfter) {
        state.selectedPostSlug = slug;
        if (DOM.previewPostSelect) DOM.previewPostSelect.value = slug;
        switchTab('tab-preview');
      }
    } catch (err) {
      showToast(`Error saving post: ${err.message}`, 'error');
    } finally {
      if (DOM.savePostBtn) DOM.savePostBtn.disabled = false;
    }
  }

  // Save & Incrementally Deploy Single Edited Post (without re-deploying entire project)
  async function handlePostSaveAndDeploy() {
    const slug = DOM.editPostSlug.value;
    const title = DOM.editPostTitle.value.trim();
    const excerpt = DOM.editPostExcerpt ? DOM.editPostExcerpt.value.trim() : '';
    const category = DOM.editPostCategory.value.trim();
    const parent_slug = DOM.editPostParentSlug.value.trim();
    const content_html =
      state.editorMode === 'source'
        ? (DOM.editPostHtmlSource ? DOM.editPostHtmlSource.value : '')
        : (DOM.editPostRichEditor ? DOM.editPostRichEditor.innerHTML : '');

    if (!title) {
      showToast('Post headline is required.', 'error');
      return;
    }

    const activePlatform = currentPlatformMode === 'github' ? 'github' : 'cloudflare';
    const isDryRun =
      activePlatform === 'github'
        ? Boolean(DOM.deployDryRun && DOM.deployDryRun.checked)
        : Boolean(DOM.deployCfDryRun && DOM.deployCfDryRun.checked);

    const origBtnHtml = DOM.saveAndDeployPostBtn ? DOM.saveAndDeployPostBtn.innerHTML : '🚀 Save & Deploy Post';

    try {
      if (DOM.saveAndDeployPostBtn) {
        DOM.saveAndDeployPostBtn.disabled = true;
        DOM.saveAndDeployPostBtn.textContent = '⏳ Deploying Post...';
      }
      if (DOM.savePostBtn) DOM.savePostBtn.disabled = true;
      if (DOM.saveAndPreviewBtn) DOM.saveAndPreviewBtn.disabled = true;

      setEditPostDeployStatus(
        'loading',
        `⏳ Saving & deploying only '${slug}' to ${activePlatform === 'github' ? 'GitHub Pages' : 'Cloudflare Workers'}...`
      );
      appendTerminalLog(`[POST DEPLOY] Saving & deploying single post '${slug}' (${activePlatform})...`, 'info');

      const res = await api(`/api/posts/${encodeURIComponent(slug)}/deploy`, 'POST', {
        title,
        excerpt,
        category,
        parent_slug,
        content_html,
        platform: activePlatform,
        dry_run: isDryRun,
      });

      const uploaded = Number(res.uploaded_files ?? (Array.isArray(res.changed_files) ? res.changed_files.length : 1));
      const cached = Number(res.cached_files || 0);
      const summaryText = res.dry_run
        ? `✅ [DRY-RUN] Rebuilt ${uploaded} file(s) for '${slug}' without full-project rebuild (${res.duration || 0}s).`
        : cached > 0
          ? `✅ Post '${slug}' is live! Uploaded ${uploaded} changed file(s) · ${cached} unchanged cached on edge (${res.duration || 0}s).`
          : `✅ Post '${slug}' is live! Updated ${uploaded} changed file(s) (${res.duration || 0}s).`;

      setEditPostDeployStatus('success', summaryText, res.post_url || res.worker_post_url || '');
      showToast(summaryText, 'success');
      appendTerminalLog(`[POST DEPLOY] ${res.message || summaryText}`, 'success');

      state.allCategories = [];
      await refreshSystem();
    } catch (err) {
      const errMsg = err && err.message ? err.message : String(err);
      setEditPostDeployStatus('error', `❌ Single-post deploy failed: ${errMsg}`);
      showToast(`Single-post deploy failed: ${errMsg}`, 'error');
      appendTerminalLog(`[POST DEPLOY ERROR] ${errMsg}`, 'error');
    } finally {
      if (DOM.saveAndDeployPostBtn) {
        DOM.saveAndDeployPostBtn.disabled = false;
        DOM.saveAndDeployPostBtn.innerHTML = origBtnHtml;
      }
      if (DOM.savePostBtn) DOM.savePostBtn.disabled = false;
      if (DOM.saveAndPreviewBtn) DOM.saveAndPreviewBtn.disabled = false;
    }
  }

  // ─── Model Switcher: 1-click preview with theme-specific demo content ────────

  function initModelSwitcher() {
    const modelBtns = document.querySelectorAll('.model-preview-btn');
    const THEME_ACCENT = {
      'editorial-warm': '#E7E2DA',
      'nordic-studio':  '#0F766E',
      'pinterest-mag':  '#C89B54',
    };

    const THEME_DEMOS = {
      'editorial-warm': {
        slug: '15-home-bedroom-refresh-ideas-transform-your-oasis',
        title: '15 Bedroom Refresh Ideas: Transform Your Oasis with Linen & Warmth',
        excerpt: 'A warm, editorial-styled bedroom sanctuary using Belgian linen bedding, bouclé accents, and Playfair serif typography — sourced exclusively from the Kinfolk slow-living aesthetic.',
        local_image_path: '/assets/images/15-home-bedroom-refresh-ideas-transform-your-oasis.webp',
        category: 'Bedroom Refresh',
        category_slug: 'bedroom-refresh',
        parent_slug: 'bedroom-ideas',
        date: '2026-10-15',
        takeaways: [
          'Belgian Linen Bedding: Choose natural flax weave in fog or oat colourways for a lived-in warmth.',
          'Warm Amber Lighting: Install 2700K Edison pendants at 3 varying heights to eliminate cold dark corners.',
          'Editor Sourcing: Source bouclé throws from ethical Merino wool producers for lasting tactile comfort.',
        ],
        checklist: [
          { id: 'step-1', text: 'Wash and pre-shrink all linen bedding before making up the bed' },
          { id: 'step-2', text: 'Layer textures: linen duvet + woven throw + embroidered cushions' },
          { id: 'step-3', text: 'Install warm amber bulb pendants with dimmable switch' },
          { id: 'step-4', text: 'Add live dried botanicals (pampas, lunaria) for editorial styling' },
        ],
      },
      'nordic-studio': {
        slug: '20-modern-bedroom-ideas-transform-your-space-with-style',
        title: '20 Modern Bedroom Ideas: Transform Your Space with Architectural Style',
        excerpt: 'An asymmetric 2-column architectural studio layout featuring technical spec drawers with room dimensions, 2700K lighting specs, White Oak herringbone flooring plans, and matte black hardware finishes.',
        local_image_path: '/assets/images/20-modern-bedroom-ideas-transform-your-space-with-style.webp',
        category: 'Modern Architecture',
        category_slug: 'modern-architecture',
        parent_slug: 'bedroom-ideas',
        date: '2026-10-20',
        takeaways: [
          'Room Dimensions First: Always start with a measured floor plan — 14ft × 16ft is the ideal studio bedroom.',
          'Lighting Specification: 2700K warm neutral kelvin ceiling and task lights create architectural depth.',
          'White Oak Herringbone: Parquet flooring in wide plank or herringbone adds tactile geometric character.',
        ],
        checklist: [
          { id: 'step-1', text: 'Draft a scaled floor plan at 14ft x 16ft with traffic flow paths mapped' },
          { id: 'step-2', text: 'Source White Oak herringbone flooring samples and compare plank widths' },
          { id: 'step-3', text: 'Install 2700K warm neutral ceiling lights + bedside task lighting' },
          { id: 'step-4', text: 'Select matte black hardware for wardrobe, drawers, and door levers' },
        ],
      },
      'pinterest-mag': {
        slug: '12-botanical-sanctuary-interiors-sunlit-spaces',
        title: '12 Botanical Sanctuary Interiors & Sunlit Coffee Bar Ideas',
        excerpt: 'Botanical Atelier Magazine: deep forest emerald header & split cover hero, champagne gold CTAs, mist sage reading canvas, Fraunces editorial serif, and sticky numbered guide sidebar.',
        local_image_path: '/assets/images/16-coastal-bedroom-decor-essentials-transform-your-space.webp',
        category: 'Botanical Living',
        category_slug: 'botanical-living',
        parent_slug: 'home-decor',
        date: '2026-10-16',
        takeaways: [
          'Deep Forest & Brass Contrast: Pairing #0F2A22 millwork with warm champagne brass creates timeless architectural depth.',
          'Soft Mist Alabaster Walls: Subtle sage-tinted neutrals keep rooms airy while harmonizing with natural foliage.',
          'Structured Editorial Rhythm: Generous whitespace and numbered section anchors make long-form guides effortless to scan.',
        ],
        checklist: [
          { id: 'step-1', text: 'Sample deep forest or olive paint swatches in both morning and evening light' },
          { id: 'step-2', text: 'Pair honed stone counters with brushed champagne-brass cabinet pulls' },
          { id: 'step-3', text: 'Add two tall sculptural indoor plants near primary natural light sources' },
          { id: 'step-4', text: 'Install dimmable 2700K warm sconces for soft evening ambiance' },
        ],
      },
    };

    modelBtns.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const theme = btn.getAttribute('data-theme');
        if (!theme) return;

        // Update visual active state on model buttons
        modelBtns.forEach((b) => {
          b.style.boxShadow = '';
          b.style.borderWidth = '2px';
        });

        const accentMap = { 'editorial-warm': '#E60023', 'nordic-studio': '#8C6D53', 'pinterest-mag': '#C89B54' };
        btn.style.boxShadow = `0 0 0 2px ${accentMap[theme] || '#666'}`;
        btn.style.borderColor = accentMap[theme] || '#666';

        // Set the theme dropdown
        if (DOM.previewThemeSelect) DOM.previewThemeSelect.value = theme;

        // Check if button requested Homepage Hub preview
        const viewMode = btn.getAttribute('data-view') || 'post';
        if (viewMode === 'hub') {
          if (DOM.previewPostSelect) DOM.previewPostSelect.value = '__hub__';
          state.selectedPostSlug = '__hub__';
          try {
            const res = await api('/api/preview', 'POST', {
              theme,
              routing_mode: DOM.previewRoutingSelect ? DOM.previewRoutingSelect.value : 'single',
              view_mode: 'hub',
              slug: '__hub__',
            });
            if (res.html && DOM.previewIframe) {
              DOM.previewIframe.srcdoc = res.html;
            }
          } catch (err) {
            showToast(`Model hub preview failed: ${err.message}`, 'error');
          }
          return;
        }

        // Get demo data for this theme
        const demo = THEME_DEMOS[theme];
        if (!demo) return;

        // Update form fields with demo content
        if (DOM.previewLiveTitle) DOM.previewLiveTitle.value = demo.title;

        // Select the sample template option
        if (DOM.previewPostSelect) DOM.previewPostSelect.value = '__sample__';
        state.selectedPostSlug = '__sample__';

        // Render preview immediately with full demo post
        try {
          const payload = {
            theme,
            routing_mode: DOM.previewRoutingSelect ? DOM.previewRoutingSelect.value : 'single',
            post: {
              slug: demo.slug,
              title: demo.title,
              excerpt: demo.excerpt,
              category: demo.category,
              category_slug: demo.category_slug,
              parent_slug: demo.parent_slug,
              date: demo.date,
              local_image_path: demo.local_image_path,
              takeaways: demo.takeaways,
              checklist: demo.checklist,
            },
          };

          const res = await api('/api/preview', 'POST', payload);
          if (res.html && DOM.previewIframe) {
            DOM.previewIframe.srcdoc = res.html;
          }
        } catch (err) {
          showToast(`Model preview failed: ${err.message}`, 'error');
        }
      });

    });

  }

  // Live Preview Engine

  async function triggerPreview() {
    const slug = DOM.previewPostSelect.value || state.selectedPostSlug || '__sample__';
    const theme = DOM.previewThemeSelect.value || DOM.cfgTheme?.value || 'nordic-studio';
    const routingMode = DOM.previewRoutingSelect.value || DOM.cfgRoutingMode?.value || 'single';
    const overrideTitle = DOM.previewLiveTitle.value.trim();
    try {
      const isHub = slug === '__hub__';
      const payload = {
        theme,
        routing_mode: routingMode,
        view_mode: isHub ? 'hub' : 'post',
        slug,
      };

      if (slug === '__sample__') {
        payload.post = {
          slug: 'modern-room-styling-guide',
          title: overrideTitle || 'Modern Scandinavian Living Room Design: 15 Warm Minimalist Ideas',
          excerpt: 'Transform your main living space with organic textures, functional hidden storage, and warm lighting layers designed for everyday comfort.',
          category: 'Living Room Styling',
          category_slug: 'living-room',
          parent_slug: 'home-organization',
          date: '2026-11-02',
          takeaways: [
            'Balanced Room Proportions: Anchor your layout with clean-lined low profile seating.',
            'Layered Textures: Blend natural oak, boucle, and linen for Scandinavian warmth.',
            'Intentional Lighting: Use 3 light sources at varying heights to eliminate dark corners.',
          ],
          checklist: [
            { id: 'step-1', text: 'Measure room footprint and map primary natural light windows' },
            { id: 'step-2', text: 'Select foundational neutral furniture pieces (boucle, warm oak)' },
            { id: 'step-3', text: 'Install warm-toned 2700K ambient and task lighting fixtures' },
          ],
        };
      } else if (overrideTitle) {
        const post = state.posts.find((p) => p.slug === slug);
        if (post) {
          payload.post = {
            ...post,
            title: overrideTitle || post.title,
          };
        }
      }

      const res = await api('/api/preview', 'POST', payload);
      if (res.html) {
        DOM.previewIframe.srcdoc = res.html;
      }
    } catch (err) {
      showToast(`Preview render failed: ${err.message}`, 'error');
    }
  }

  function updateRootDomainPreview() {
    const owner = (DOM.cfgStep1GithubOwner && DOM.cfgStep1GithubOwner.value || '').trim();
    const isAuto = DOM.cfgStep1AutoRootOrg ? DOM.cfgStep1AutoRootOrg.checked : false;
    if (isAuto && owner && DOM.cfgStep1GithubRepo) {
      DOM.cfgStep1GithubRepo.value = `${owner}.github.io`;
    }

    const repo = (DOM.cfgStep1GithubRepo && DOM.cfgStep1GithubRepo.value || '').trim();
    const safeOwner = owner.replace(/[^a-zA-Z0-9._-]/g, '');
    const safeRepo = repo.replace(/[^a-zA-Z0-9._-]/g, '');
    let previewHtml = '';
    if (safeRepo.endsWith('.github.io') || (!safeRepo && safeOwner)) {
      const domain = safeRepo.endsWith('.github.io') ? safeRepo : `${safeOwner}.github.io`;
      const escDomain = escapeHtml(domain);
      previewHtml = `Target: <a href="https://${escDomain}" target="_blank" rel="noopener noreferrer" style="color:#34D399;font-weight:bold;text-decoration:none;">https://${escDomain}/</a>`;
    } else if (safeOwner && safeRepo) {
      const escOwner = escapeHtml(safeOwner);
      const escRepo = escapeHtml(safeRepo);
      previewHtml = `Target: <a href="https://${escOwner}.github.io/${escRepo}/" target="_blank" rel="noopener noreferrer" style="color:#38BDF8;font-weight:bold;text-decoration:none;">https://${escOwner}.github.io/${escRepo}/</a>`;
    } else {
      previewHtml = 'Target: https://&lt;org&gt;.github.io/';
    }

    if (DOM.step1RootDomainPreview) DOM.step1RootDomainPreview.innerHTML = previewHtml;
  }

  // Event Listeners Setup
  function initListeners() {
    // Token Visibility Eye Toggles
    if (DOM.toggleCfTokenEye && DOM.cfgCfToken) {
      DOM.toggleCfTokenEye.addEventListener('click', () => {
        const isPass = DOM.cfgCfToken.type === 'password';
        DOM.cfgCfToken.type = isPass ? 'text' : 'password';
        DOM.toggleCfTokenEye.textContent = isPass ? '🔒' : '👁️';
      });

    }

    if (DOM.toggleGhTokenEye && DOM.cfgGithubToken) {
      DOM.toggleGhTokenEye.addEventListener('click', () => {
        const isPass = DOM.cfgGithubToken.type === 'password';
        DOM.cfgGithubToken.type = isPass ? 'text' : 'password';
        DOM.toggleGhTokenEye.textContent = isPass ? '🔒' : '👁️';
      });

    }

    // Cloudflare Settings Form Submit
    if (DOM.cloudflareSettingsForm) {
      DOM.cloudflareSettingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const payload = {
            cloudflare: {
              token: DOM.cfgCfToken.value.trim(),
              api_token: DOM.cfgCfToken.value.trim(),
              account_id: DOM.cfgCfAccountId.value.trim(),
              account_subdomain: (DOM.cfgCfAccountSubdomain && DOM.cfgCfAccountSubdomain.value.trim()) || '',
              project_name: DOM.cfgCfProjectName.value.trim(),
              deployment_type: DOM.cfgCfDeployType.value,
              custom_domain: DOM.cfgCfCustomDomain.value.trim(),
              compatibility_date: DOM.cfgCfCompatibilityDate.value.trim(),
            },
          };

          await api('/api/config', 'POST', payload);
          showToast('Cloudflare configuration saved successfully.', 'success');
          if (DOM.cfStatusFeedback) {
            DOM.cfStatusFeedback.style.display = 'block';
            DOM.cfStatusFeedback.style.background = 'rgba(16, 185, 129, 0.18)';
            DOM.cfStatusFeedback.style.color = '#34D399';
            DOM.cfStatusFeedback.innerHTML = '💾 <strong>Saved!</strong> Cloudflare settings saved and configuration updated on disk.';
          }
          await refreshSystem();
        } catch (err) {
          showToast(`Cloudflare save error: ${err.message}`, 'error');
          if (DOM.cfStatusFeedback) {
            DOM.cfStatusFeedback.style.display = 'block';
            DOM.cfStatusFeedback.style.background = 'rgba(239, 68, 68, 0.18)';
            DOM.cfStatusFeedback.style.color = '#FCA5A5';
            DOM.cfStatusFeedback.innerHTML = `❌ <strong>Save Error:</strong> ${escapeHtml(err.message)}`;
          }
        }
      });

    }

    // Cloudflare Token Verification Action
    if (DOM.btnVerifyCfToken) {
      DOM.btnVerifyCfToken.addEventListener('click', async () => {
        let token = (DOM.cfgCfToken && DOM.cfgCfToken.value || '').trim();
        if (token.includes('****')) {
          token = ''; // let server use the saved config token
        }

        const accountId = (DOM.cfgCfAccountId && DOM.cfgCfAccountId.value || '').trim();
        DOM.cfStatusFeedback.style.display = 'block';
        DOM.cfStatusFeedback.style.background = 'rgba(59, 130, 246, 0.15)';
        DOM.cfStatusFeedback.style.color = '#93C5FD';
        DOM.cfStatusFeedback.innerHTML = '⏳ Verifying Cloudflare credentials against Cloudflare API...';
        try {
          const res = await api('/api/cloudflare/verify', 'POST', { token, account_id: accountId });
          if (res.success && res.verified) {
            DOM.cfStatusFeedback.style.background = 'rgba(16, 185, 129, 0.18)';
            DOM.cfStatusFeedback.style.color = '#34D399';
            const subInfo = res.subdomain ? ` (Subdomain: <code>${escapeHtml(res.subdomain)}</code>)` : '';
            DOM.cfStatusFeedback.innerHTML = `✅ <strong>Verified!</strong> Cloudflare Token is active for Account <code>${escapeHtml(res.account_id || accountId || 'Auto')}</code>${subInfo}.`;
            if (res.account_id && DOM.cfgCfAccountId && !DOM.cfgCfAccountId.value.trim()) {
              DOM.cfgCfAccountId.value = res.account_id;
            }
            if (res.subdomain && DOM.cfgCfAccountSubdomain) {
              DOM.cfgCfAccountSubdomain.value = res.subdomain;
            }
            updateCloudflareLiveUrlPreview();
            if (DOM.cfTokenStatusBadge) {
              DOM.cfTokenStatusBadge.textContent = '● Verified Active';
              DOM.cfTokenStatusBadge.style.color = '#10B981';
            }
            showToast('Cloudflare credentials verified successfully!', 'success');
          } else {
            DOM.cfStatusFeedback.style.background = 'rgba(239, 68, 68, 0.18)';
            DOM.cfStatusFeedback.style.color = '#FCA5A5';
            DOM.cfStatusFeedback.innerHTML = `❌ Verification failed: ${escapeHtml(res.error || res.message || 'Invalid credentials')}`;
            if (DOM.cfTokenStatusBadge) {
              DOM.cfTokenStatusBadge.textContent = '✕ Invalid Token';
              DOM.cfTokenStatusBadge.style.color = '#EF4444';
            }
            showToast(res.error || 'Verification failed', 'error');
          }
        } catch (err) {
          DOM.cfStatusFeedback.style.background = 'rgba(239, 68, 68, 0.18)';
          DOM.cfStatusFeedback.style.color = '#FCA5A5';
          DOM.cfStatusFeedback.innerHTML = `❌ Error: ${escapeHtml(err.message)}`;
          showToast(`Verification error: ${err.message}`, 'error');
        }
      });

    }

    // Dynamic Cloudflare Live URL Preview
    [DOM.cfgCfProjectName, DOM.cfgCfAccountSubdomain, DOM.cfgCfCustomDomain].forEach((inputEl) => {
      if (inputEl) {
        inputEl.addEventListener('input', updateCloudflareLiveUrlPreview);
      }
    });
    if (DOM.cfgCfDeployType) {
      DOM.cfgCfDeployType.addEventListener('change', updateCloudflareLiveUrlPreview);
    }

    // Auto-save Project Name and Custom Domain from Ingest Step
    let domainDebounceTimer = null;
    const saveIngestProjectConfig = async () => {
      await autoSaveActiveProject();
      updateCloudflareLiveUrlPreview();
    };
    if (DOM.cfgCfProjectName) {
      DOM.cfgCfProjectName.addEventListener('change', saveIngestProjectConfig);
      DOM.cfgCfProjectName.addEventListener('blur', saveIngestProjectConfig);
      DOM.cfgCfProjectName.addEventListener('input', () => {
        clearTimeout(domainDebounceTimer);
        domainDebounceTimer = setTimeout(saveIngestProjectConfig, 350);
      });
    }
    if (DOM.cfgCfCustomDomain) {
      DOM.cfgCfCustomDomain.addEventListener('change', saveIngestProjectConfig);
      DOM.cfgCfCustomDomain.addEventListener('blur', saveIngestProjectConfig);
      DOM.cfgCfCustomDomain.addEventListener('input', () => {
        clearTimeout(domainDebounceTimer);
        domainDebounceTimer = setTimeout(saveIngestProjectConfig, 350);
      });
    }

    // Dynamic Token Auto-Detection Listener
    let tokenTimer = null;
    if (DOM.cfgGithubToken) {
      DOM.cfgGithubToken.addEventListener('input', () => {
        clearTimeout(tokenTimer);
        const val = DOM.cfgGithubToken.value.trim();
        if (!val || val.includes('****')) {
          loadGithubAccounts(null);
          return;
        }

        if (val.length >= 25) {
          tokenTimer = setTimeout(() => {
            loadGithubAccounts(val);
          }, 600);
        }
      });

      DOM.cfgGithubToken.addEventListener('paste', () => {
        setTimeout(() => {
          const val = DOM.cfgGithubToken.value.trim();
          if (val && !val.includes('****')) {
            loadGithubAccounts(val);
          }
        }, 150);
      });

    }

    // =========================================================================
    // STEP 1 GITHUB TARGET ROUTING & DETECTED ACCOUNT LISTENERS
    // =========================================================================
    if (DOM.cfgStep1GithubAccount) {
      DOM.cfgStep1GithubAccount.addEventListener('change', async () => {
        const val = DOM.cfgStep1GithubAccount.value;
        if (!val) return;
        const opt = DOM.cfgStep1GithubAccount.selectedOptions[0];
        const isOrg = opt ? opt.dataset.isOrg === 'true' : false;
        if (DOM.cfgStep1GithubOwner) DOM.cfgStep1GithubOwner.value = val;
        if (DOM.cfgStep1AutoRootOrg && DOM.cfgStep1AutoRootOrg.checked) {
          if (DOM.cfgStep1GithubRepo) DOM.cfgStep1GithubRepo.value = `${val}.github.io`;
        }
        updateRootDomainPreview();
        try {
          await api('/api/config', 'POST', {
            github: {
              owner: val,
              repo: DOM.cfgStep1GithubRepo ? DOM.cfgStep1GithubRepo.value.trim() : `${val}.github.io`,
              is_org: isOrg
            }
          });
          showToast(`GitHub Organization set to '${val}'`, 'info');
        } catch (e) {
          console.warn('Auto-save of GitHub owner failed:', e);
        }
      });
    }

    if (DOM.btnRefreshStep1Orgs) {
      DOM.btnRefreshStep1Orgs.addEventListener('click', async () => {
        if (DOM.cfgStep1GithubAccount) {
          DOM.cfgStep1GithubAccount.innerHTML = '<option value="">🔄 Refreshing organizations...</option>';
        }
        await loadGithubAccounts();
        showToast('GitHub accounts refreshed from API.', 'info');
      });
    }

    if (DOM.cfgStep1AutoRootOrg) {
      DOM.cfgStep1AutoRootOrg.addEventListener('change', () => {
        updateRootDomainPreview();
        if (DOM.cfgStep1GithubRepo) {
          api('/api/config', 'POST', { github: { repo: DOM.cfgStep1GithubRepo.value.trim() } }).catch(() => {});
        }
      });
    }

    if (DOM.btnStep1CheckOrg) {
      DOM.btnStep1CheckOrg.addEventListener('click', async () => {
        const orgName = (DOM.cfgStep1GithubOwner ? DOM.cfgStep1GithubOwner.value : '').trim();
        let token = (DOM.cfgGithubToken ? DOM.cfgGithubToken.value : '').trim();
        if (token.includes('****')) token = '';
        if (!orgName) {
          showToast('Please enter or select an Organization first.', 'error');
          if (DOM.cfgStep1GithubOwner) DOM.cfgStep1GithubOwner.focus();
          return;
        }
        DOM.btnStep1CheckOrg.disabled = true;
        DOM.btnStep1CheckOrg.innerHTML = '<span>⏳ Querying GitHub API...</span>';
        if (DOM.step1OrgStatusFeedback) {
          DOM.step1OrgStatusFeedback.style.display = 'block';
          DOM.step1OrgStatusFeedback.style.background = 'rgba(59, 130, 246, 0.15)';
          DOM.step1OrgStatusFeedback.style.color = '#93C5FD';
          DOM.step1OrgStatusFeedback.innerHTML = `Checking status of organization <strong>${escapeHtml(orgName)}</strong> on GitHub...`;
        }
        try {
          const res = await api('/api/github/check-org', 'POST', { org: orgName, token: token });
          if (res.exists) {
            if (DOM.step1OrgStatusFeedback) {
              DOM.step1OrgStatusFeedback.style.background = 'rgba(16, 185, 129, 0.18)';
              DOM.step1OrgStatusFeedback.style.color = '#34D399';
              DOM.step1OrgStatusFeedback.innerHTML = `✅ <strong>${escapeHtml(res.message || '')}</strong><br><small>Plan: ${escapeHtml(res.details?.plan || 'Free')} | Verified repository container ready.</small>`;
            }
            showToast(`Organization '${orgName}' is ready!`, 'success');
          } else {
            if (DOM.step1OrgStatusFeedback) {
              DOM.step1OrgStatusFeedback.style.background = 'rgba(245, 158, 11, 0.18)';
              DOM.step1OrgStatusFeedback.style.color = '#FCD34D';
              DOM.step1OrgStatusFeedback.innerHTML = `⚠️ <strong>${escapeHtml(res.message || '')}</strong><br><small style="color:#E2E8F0;">${escapeHtml(res.api_limitation || '')}</small>`;
            }
            if (DOM.linkStep1OpenGithubOrg) {
              DOM.linkStep1OpenGithubOrg.style.display = 'inline-flex';
              const safeCreateUrl = /^https:\/\//i.test(String(res.create_web_url || ''))
                ? res.create_web_url
                : 'https://github.com/account/organizations/new?plan=free';
              DOM.linkStep1OpenGithubOrg.href = safeCreateUrl;
            }
            showToast(`Organization '${orgName}' needs to be created on GitHub.`, 'warning');
          }
        } catch (err) {
          if (DOM.step1OrgStatusFeedback) {
            DOM.step1OrgStatusFeedback.style.background = 'rgba(239, 68, 68, 0.18)';
            DOM.step1OrgStatusFeedback.style.color = '#FCA5A5';
            DOM.step1OrgStatusFeedback.innerHTML = `❌ Error: ${escapeHtml(err.message || String(err))}`;
          }
        } finally {
          DOM.btnStep1CheckOrg.disabled = false;
          DOM.btnStep1CheckOrg.innerHTML = '<span>🏢 Verify Org</span>';
        }
      });
    }

    if (DOM.btnStep1CreateRepo) {
      DOM.btnStep1CreateRepo.addEventListener('click', async () => {
        const owner = (DOM.cfgStep1GithubOwner ? DOM.cfgStep1GithubOwner.value : '').trim();
        const repo = (DOM.cfgStep1GithubRepo ? DOM.cfgStep1GithubRepo.value : '').trim();
        let token = (DOM.cfgGithubToken ? DOM.cfgGithubToken.value : '').trim();
        if (token.includes('****')) token = '';
        if (!owner || !repo) {
          showToast('Please enter Organization and Repository Name first.', 'error');
          return;
        }
        DOM.btnStep1CreateRepo.disabled = true;
        DOM.btnStep1CreateRepo.innerHTML = '<span>⏳ Creating Repo on GitHub...</span>';
        if (DOM.step1OrgStatusFeedback) {
          DOM.step1OrgStatusFeedback.style.display = 'block';
          DOM.step1OrgStatusFeedback.style.background = 'rgba(59, 130, 246, 0.15)';
          DOM.step1OrgStatusFeedback.style.color = '#93C5FD';
          DOM.step1OrgStatusFeedback.innerHTML = `Creating repository <strong>${escapeHtml(owner)}/${escapeHtml(repo)}</strong> on GitHub...`;
        }
        try {
          const selectedOpt = DOM.cfgStep1GithubAccount?.selectedOptions?.[0];
          const isOrg =
            selectedOpt && selectedOpt.value === owner
              ? selectedOpt.dataset.isOrg === 'true'
              : Boolean(state.config?.github?.is_org);
          const res = await api('/api/github/create-repo', 'POST', {
            owner,
            repo,
            is_org: isOrg,
            token: token
          });
          if (res.success) {
            if (DOM.step1OrgStatusFeedback) {
              DOM.step1OrgStatusFeedback.style.background = 'rgba(16, 185, 129, 0.18)';
              DOM.step1OrgStatusFeedback.style.color = '#34D399';
              const safeRepoUrl = /^https:\/\//i.test(String(res.repo_url || '')) ? escapeHtml(res.repo_url) : '#';
              const safePagesUrl = /^https:\/\//i.test(String(res.pages_url || '')) ? escapeHtml(res.pages_url) : '#';
              DOM.step1OrgStatusFeedback.innerHTML = `✅ <strong>Repository '${escapeHtml(owner)}/${escapeHtml(repo)}' Ready!</strong><br><small><a href="${safeRepoUrl}" target="_blank" rel="noopener noreferrer" style="color:#60A5FA;">↗ View on GitHub</a> | Pages: <a href="${safePagesUrl}" target="_blank" rel="noopener noreferrer" style="color:#34D399;">${safePagesUrl}</a></small>`;
            }
            showToast(`Repository '${owner}/${repo}' configured!`, 'success');
          } else {
            if (DOM.step1OrgStatusFeedback) {
              DOM.step1OrgStatusFeedback.style.background = 'rgba(239, 68, 68, 0.18)';
              DOM.step1OrgStatusFeedback.style.color = '#FCA5A5';
              DOM.step1OrgStatusFeedback.innerHTML = `❌ ${escapeHtml(res.error || 'Failed to create repository')}`;
            }
            showToast(res.error || 'Failed to create repository', 'error');
          }
        } catch (err) {
          if (DOM.step1OrgStatusFeedback) {
            DOM.step1OrgStatusFeedback.style.background = 'rgba(239, 68, 68, 0.18)';
            DOM.step1OrgStatusFeedback.style.color = '#FCA5A5';
            DOM.step1OrgStatusFeedback.innerHTML = `❌ Error: ${escapeHtml(err.message || String(err))}`;
          }
        } finally {
          DOM.btnStep1CreateRepo.disabled = false;
          DOM.btnStep1CreateRepo.innerHTML = '<span>🚀 Create Repo</span>';
        }
      });
    }

    if (DOM.newProjGhOwnerSelect) {
      DOM.newProjGhOwnerSelect.addEventListener('change', () => {
        const val = DOM.newProjGhOwnerSelect.value;
        if (!val) return;
        if (DOM.newProjGhOwner) DOM.newProjGhOwner.value = val;
        if (DOM.newProjGhRepo) DOM.newProjGhRepo.value = `${val}.github.io`;
      });
    }

    if (DOM.btnVerifyGhToken) {
      DOM.btnVerifyGhToken.addEventListener('click', async () => {
        DOM.btnVerifyGhToken.disabled = true;
        DOM.btnVerifyGhToken.innerHTML = '<span>⏳ Querying GitHub...</span>';
        if (DOM.ghStatusFeedback) {
          DOM.ghStatusFeedback.style.display = 'block';
          DOM.ghStatusFeedback.style.background = 'rgba(59, 130, 246, 0.15)';
          DOM.ghStatusFeedback.style.color = '#93C5FD';
          DOM.ghStatusFeedback.textContent = 'Testing GitHub Personal Access Token & querying organizations...';
        }
        try {
          const accounts = await loadGithubAccounts();
          const count = Array.isArray(accounts) ? accounts.length : 0;
          if (DOM.ghStatusFeedback) {
            if (count > 0) {
              DOM.ghStatusFeedback.style.background = 'rgba(16, 185, 129, 0.18)';
              DOM.ghStatusFeedback.style.color = '#34D399';
              DOM.ghStatusFeedback.textContent = `✅ GitHub token verified. Detected ${count} account/organization(s).`;
            } else {
              DOM.ghStatusFeedback.style.background = 'rgba(245, 158, 11, 0.18)';
              DOM.ghStatusFeedback.style.color = '#FCD34D';
              DOM.ghStatusFeedback.textContent = '⚠️ No GitHub accounts detected. Enter a valid Personal Access Token with repo & read:org scopes.';
            }
          }
          showToast(count > 0 ? `GitHub token verified (${count} accounts detected).` : 'No GitHub token or accounts detected.', count > 0 ? 'success' : 'warning');
        } catch (err) {
          if (DOM.ghStatusFeedback) {
            DOM.ghStatusFeedback.style.background = 'rgba(239, 68, 68, 0.18)';
            DOM.ghStatusFeedback.style.color = '#FCA5A5';
            DOM.ghStatusFeedback.textContent = `❌ GitHub check failed: ${err.message}`;
          }
        } finally {
          DOM.btnVerifyGhToken.disabled = false;
          DOM.btnVerifyGhToken.innerHTML = '<span>⚡ Test Token &amp; Detect Orgs</span>';
        }
      });
    }

    // Settings Submit
    DOM.settingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const tokenInput = DOM.cfgGithubToken.value.trim();
        const ghPayload = {
          branch: DOM.cfgGithubBranch ? DOM.cfgGithubBranch.value.trim() : 'main',
          base_path: DOM.cfgGithubBasePath ? DOM.cfgGithubBasePath.value.trim() : '',
        };
        if (DOM.cfgStep1GithubOwner && DOM.cfgStep1GithubOwner.value.trim()) {
          ghPayload.owner = DOM.cfgStep1GithubOwner.value.trim();
        }
        if (DOM.cfgStep1GithubRepo && DOM.cfgStep1GithubRepo.value.trim()) {
          ghPayload.repo = DOM.cfgStep1GithubRepo.value.trim();
        }

        if (tokenInput && !tokenInput.includes('****')) {
          ghPayload.token = tokenInput;
        }
        await api('/api/config', 'POST', {
          github: ghPayload,
        });

        if (DOM.ghStatusFeedback) {
          DOM.ghStatusFeedback.style.display = 'block';
          DOM.ghStatusFeedback.style.background = 'rgba(16, 185, 129, 0.18)';
          DOM.ghStatusFeedback.style.color = '#34D399';
          DOM.ghStatusFeedback.textContent = `✅ GitHub settings saved (branch: ${ghPayload.branch || 'main'}).`;
        }
        showToast('GitHub configuration saved.', 'success');
        await loadGithubAccounts();
        if (tokenInput && !tokenInput.includes('****')) {
          DOM.cfgGithubToken.value = '';
        }
        await refreshSystem();
      } catch (err) {
        if (DOM.ghStatusFeedback) {
          DOM.ghStatusFeedback.style.display = 'block';
          DOM.ghStatusFeedback.style.background = 'rgba(239, 68, 68, 0.18)';
          DOM.ghStatusFeedback.style.color = '#FCA5A5';
          DOM.ghStatusFeedback.textContent = `❌ Save failed: ${err.message}`;
        }
        showToast(`Save error: ${err.message}`, 'error');
      }
    });

    // Build Options Submit
    DOM.buildOptionsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/api/config', 'POST', {
          build: {
            theme: DOM.cfgTheme.value,
            routing_mode: DOM.cfgRoutingMode.value,
            output_dir: DOM.cfgOutputDir.value.trim(),
          },
          ingestion: {
            wp_api_url: DOM.cfgWpApiUrl.value.trim(),
          },
          branding: {
            brand_name: DOM.cfgBrandName ? DOM.cfgBrandName.value.trim() : 'Anna Deco',
            tagline: DOM.cfgBrandTagline ? DOM.cfgBrandTagline.value.trim() : '',
            author_name: DOM.cfgAuthorName ? DOM.cfgAuthorName.value.trim() : 'Anna Lindqvist',
            author_bio: DOM.cfgAuthorBio ? DOM.cfgAuthorBio.value.trim() : '',
            enable_toc: DOM.cfgEnableToc ? DOM.cfgEnableToc.checked : true,
            enable_faq: DOM.cfgEnableFaq ? DOM.cfgEnableFaq.checked : true,
            enable_eeat: DOM.cfgEnableEeat ? DOM.cfgEnableEeat.checked : true,
            social_links: {
              pinterest: DOM.cfgSocialPinterest ? DOM.cfgSocialPinterest.value.trim() : '',
              facebook: DOM.cfgSocialFacebook ? DOM.cfgSocialFacebook.value.trim() : '',
              instagram: DOM.cfgSocialInstagram ? DOM.cfgSocialInstagram.value.trim() : '',
              twitter: DOM.cfgSocialTwitter ? DOM.cfgSocialTwitter.value.trim() : '',
              tiktok: DOM.cfgSocialTiktok ? DOM.cfgSocialTiktok.value.trim() : '',
              youtube: DOM.cfgSocialYoutube ? DOM.cfgSocialYoutube.value.trim() : '',
            },
            custom_head_code: DOM.cfgCustomHeadCode ? DOM.cfgCustomHeadCode.value.trim() : '',
          },
        });

        showToast('Generation settings updated.', 'success');
        await refreshSystem();
        triggerPreview();
      } catch (err) {
        showToast(`Save error: ${err.message}`, 'error');
      }
    });

    // Reusable Logo Persistence Handler
    async function saveLogoPayload(base64Data) {
      try {
        showToast('Saving custom logo...', 'info');
        const bName = DOM.cfgBrandName ? DOM.cfgBrandName.value.trim() : (DOM.quickBrandNameDisplay ? DOM.quickBrandNameDisplay.textContent.trim() : 'Anna Deco');
        const tag = DOM.cfgBrandTagline ? DOM.cfgBrandTagline.value.trim() : (DOM.quickTaglineDisplay ? DOM.quickTaglineDisplay.textContent.trim() : '');
        const res = await api('/api/upload-logo', 'POST', {
          data: base64Data,
          brand_name: bName,
          tagline: tag,
        });

        if (res.success) {
          showToast('Custom logo saved & active across all models!', 'success');
          updateLogoPreview(res.logo_url, res.brand_name, res.tagline);
          if (state.config && state.config.branding) {
            state.config.branding.logo_path = res.logo_url;
            state.config.branding.brand_name = res.brand_name;
            state.config.branding.tagline = res.tagline;
          }
          triggerPreview();
        } else {
          showToast(`Logo Upload Failed: ${res.error || 'Unknown error'}`, 'error');
        }
      } catch (err) {
        showToast(`Upload Error: ${err.message}`, 'error');
      }
    }

    // Interactive Logo Cropper & Studio Launcher
    function openCropStudio(source) {
      if (!source) return;
      if (!window.cropperStudioInstance && window.LogoCropperStudio) {
        window.cropperStudioInstance = new window.LogoCropperStudio();
      }
      if (window.cropperStudioInstance) {
        const bName = DOM.cfgBrandName ? DOM.cfgBrandName.value.trim() : (DOM.quickBrandNameDisplay ? DOM.quickBrandNameDisplay.textContent.trim() : 'Anna Deco');
        const tag = DOM.cfgBrandTagline ? DOM.cfgBrandTagline.value.trim() : (DOM.quickTaglineDisplay ? DOM.quickTaglineDisplay.textContent.trim() : '');
        window.cropperStudioInstance.open(source, {
          brandName: bName,
          tagline: tag,
          aspectRatio: '4:1',
          onApply: async (croppedDataUrl) => {
            await saveLogoPayload(croppedDataUrl);
          }
        });
      } else {
        if (typeof source === 'string') {
          saveLogoPayload(source);
        } else if (source instanceof File || source instanceof Blob) {
          const reader = new FileReader();
          reader.onload = async () => saveLogoPayload(reader.result);
          reader.readAsDataURL(source);
        }
      }
    }

    // Reusable Logo Upload Handler with Cropper Studio Interception
    async function uploadCustomLogo(file) {
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        showToast('Image file exceeds 10MB limit.', 'error');
        return;
      }
      openCropStudio(file);
    }

    // Trigger Cropper Studio for currently active logo
    function openCropStudioForCurrentLogo() {
      let currentLogo = '';
      if (DOM.quickLogoPreviewBox) {
        const img = DOM.quickLogoPreviewBox.querySelector('img');
        if (img && img.src && !img.src.includes('placeholder')) {
          currentLogo = img.src;
        }
      }
      if (!currentLogo && state.config && state.config.branding && state.config.branding.logo_path) {
        currentLogo = toSpaceAssetUrl(state.config.branding.logo_path);
      }

      if (currentLogo) {
        openCropStudio(currentLogo);
      } else {
        if (DOM.quickLogoFileInput) {
          DOM.quickLogoFileInput.click();
        }
      }
    }

    // Reusable Logo Reset Handler

    async function resetCustomLogo() {
      try {
        const res = await api('/api/upload-logo', 'POST', { reset: true });
        if (res.success) {
          showToast('Reset to default vector SVG emblem.', 'info');
          updateLogoPreview('', DOM.cfgBrandName ? DOM.cfgBrandName.value : 'Anna Deco');
          if (DOM.quickLogoFileInput) DOM.quickLogoFileInput.value = '';
          if (DOM.previewLogoFileInput) DOM.previewLogoFileInput.value = '';
          triggerPreview();
        }
      } catch (err) {
        showToast(`Reset Error: ${err.message}`, 'error');
      }
    }

    // Wire file inputs across Theme gallery & Preview sidebar
    if (DOM.quickLogoFileInput) {
      DOM.quickLogoFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (file) uploadCustomLogo(file);
      });
    }
    if (DOM.previewLogoFileInput) {
      DOM.previewLogoFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (file) uploadCustomLogo(file);
      });
    }

    // Wire crop & zoom button
    if (DOM.quickBtnCropLogo) {
      DOM.quickBtnCropLogo.addEventListener('click', openCropStudioForCurrentLogo);
    }

    // Wire reset button
    if (DOM.quickBtnResetLogo) {
      DOM.quickBtnResetLogo.addEventListener('click', resetCustomLogo);
    }

    // Source Type Switcher
    DOM.ingestSourceType.addEventListener('change', () => {
      const val = DOM.ingestSourceType.value;
      if (val === 'url_list') {
        DOM.groupSitemapUrl.style.display = 'none';
        DOM.groupUrlList.style.display = 'block';
      } else {
        DOM.groupSitemapUrl.style.display = 'block';
        DOM.groupUrlList.style.display = 'none';
        if (val === 'wp_api') {
          if (DOM.ingestUrlLabel) DOM.ingestUrlLabel.textContent = 'WordPress Site URL';
          if (DOM.ingestSitemapUrl) DOM.ingestSitemapUrl.placeholder = 'https://example.com';
        } else {
          if (DOM.ingestUrlLabel) DOM.ingestUrlLabel.textContent = 'Sitemap URL';
          if (DOM.ingestSitemapUrl) DOM.ingestSitemapUrl.placeholder = 'https://stylesdays.com/post-sitemap8.xml';
        }
      }
    });

    // Scan Sitemap / URL List / WP API
    DOM.scanSitemapBtn.addEventListener('click', async () => {
      try {
        await autoSaveActiveProject();
        const sourceType = DOM.ingestSourceType ? DOM.ingestSourceType.value : 'sitemap';
        const urlOrList =
          sourceType === 'url_list' && DOM.ingestUrlList
            ? DOM.ingestUrlList.value.trim()
            : DOM.ingestSitemapUrl.value.trim();
        const parsedMax = DOM.ingestMaxPosts ? parseInt(DOM.ingestMaxPosts.value, 10) : 100;
        const maxPostsVal = Number.isNaN(parsedMax) ? 100 : Math.max(0, parsedMax);
        DOM.scanSitemapBtn.disabled = true;
        DOM.scanSitemapBtn.textContent = '⏳ Scanning...';
        appendTerminalLog(`Scanning ${sourceType} source...`, 'info');
        const res = await api('/api/sitemap/scan', 'POST', {
          source_type: sourceType,
          url_or_list: urlOrList,
          max_posts: maxPostsVal,
        });
        if (res.success === false) {
          if (DOM.scanResultBanner) DOM.scanResultBanner.style.display = 'none';
          showToast(`Scan failed: ${res.error || 'No URLs found'}`, 'error');
          appendTerminalLog(`[ERROR] Scan failed: ${res.error || 'No URLs found'}`, 'error');
          return;
        }
        const exactCount = Number(res.discovered_count || 0);
        // Sync Max Posts down to exact sitemap count when sitemap has fewer URLs than Max Posts
        if (DOM.ingestMaxPosts && exactCount > 0 && maxPostsVal > exactCount) {
          DOM.ingestMaxPosts.value = String(exactCount);
          await autoSaveActiveProject();
        }
        const effectiveWillIngest =
          DOM.ingestMaxPosts && parseInt(DOM.ingestMaxPosts.value, 10) > 0
            ? Math.min(exactCount, parseInt(DOM.ingestMaxPosts.value, 10))
            : exactCount;
        if (DOM.scanResultBanner) {
          DOM.scanResultBanner.style.display = 'block';
          DOM.scanResultBanner.textContent =
            exactCount === effectiveWillIngest
              ? `✅ Exact sitemap scan: ${exactCount} post URL(s) found — ready to ingest all ${exactCount}.`
              : `✅ Exact sitemap scan: ${exactCount} post URL(s) found (Max Posts cap set to ${effectiveWillIngest}).`;
        }
        showToast(`Exact scan: ${exactCount} post URL(s) found in source.`, 'success');
        appendTerminalLog(`Scan complete: exact ${exactCount} URL(s) located (will ingest ${effectiveWillIngest}).`, 'success');
      } catch (err) {
        showToast(`Scan failed: ${err.message}`, 'error');
      } finally {
        DOM.scanSitemapBtn.disabled = false;
        DOM.scanSitemapBtn.textContent = '🔍 Scan URLs';
      }
    });

    // Stop Active Ingestion
    if (DOM.stopIngestBtn) {
      DOM.stopIngestBtn.addEventListener('click', async () => {
        try {
          DOM.stopIngestBtn.disabled = true;
          const res = await api('/api/ingest/stop', 'POST');
          if (state.ingestPollInterval) {
            clearInterval(state.ingestPollInterval);
            state.ingestPollInterval = null;
          }
          setIngestRunningUI(false, `⏹️ ${res.message || 'Ingestion stopped by user.'}`);
          showToast(res.message || 'Ingestion stopped.', 'warning');
          appendTerminalLog(`[INGEST] ${res.message || 'Stopped by user.'}`, 'warning');
        } catch (err) {
          showToast(`Failed to stop ingestion: ${err.message}`, 'error');
        }
      });
    }

    // Clear Active Project Data (2-step inline confirmation — no window.confirm)
    if (DOM.clearProjectBtn) {
      DOM.clearProjectBtn.addEventListener('click', () => {
        if (!DOM.clearProjectConfirmBar) return;
        const isOpen = DOM.clearProjectConfirmBar.style.display !== 'none';
        DOM.clearProjectConfirmBar.style.display = isOpen ? 'none' : 'flex';
      });
    }

    if (DOM.btnCancelClearProject) {
      DOM.btnCancelClearProject.addEventListener('click', () => {
        if (DOM.clearProjectConfirmBar) DOM.clearProjectConfirmBar.style.display = 'none';
      });
    }

    if (DOM.btnConfirmClearProject) {
      DOM.btnConfirmClearProject.addEventListener('click', async () => {
        try {
          DOM.btnConfirmClearProject.disabled = true;
          DOM.btnConfirmClearProject.textContent = '⏳ Clearing...';
          const res = await api('/api/projects/clear', 'POST', {
            project_id: state.activeProject,
          });
          if (DOM.clearProjectConfirmBar) DOM.clearProjectConfirmBar.style.display = 'none';
          if (state.ingestPollInterval) {
            clearInterval(state.ingestPollInterval);
            state.ingestPollInterval = null;
          }
          setIngestRunningUI(false);
          if (DOM.ingestProgressBarContainer) DOM.ingestProgressBarContainer.style.display = 'none';
          if (DOM.scanResultBanner) DOM.scanResultBanner.style.display = 'none';
          if (DOM.diffNewCount) DOM.diffNewCount.textContent = '0';
          if (DOM.diffUpdatedCount) DOM.diffUpdatedCount.textContent = '0';
          if (DOM.diffSyncedCount) DOM.diffSyncedCount.textContent = '0';
          if (DOM.diffSummaryTableBody) DOM.diffSummaryTableBody.innerHTML = '';
          state.posts = [];
          state.allCategories = [];
          renderPostsTable();
          populateCategoryFilter();
          showToast(res.message || 'All project data cleared.', 'success');
          appendTerminalLog(`[PROJECT CLEAR] ${res.message || 'Cleared all project data.'}`, 'success');
          await refreshSystem();
          await refreshPosts();
          await loadProjects();
        } catch (err) {
          showToast(`Error clearing project: ${err.message}`, 'error');
          appendTerminalLog(`[PROJECT CLEAR ERROR] ${err.message}`, 'error');
        } finally {
          DOM.btnConfirmClearProject.disabled = false;
          DOM.btnConfirmClearProject.textContent = 'Yes, Clear All Data';
        }
      });
    }

    // Run Ingestion
    DOM.ingestionForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (state.isIngesting) {
        showToast('Ingestion is already running. Click Stop first to cancel.', 'warning');
        return;
      }

      const sourceType = DOM.ingestSourceType.value;
      const urlOrList = (sourceType === 'url_list' ? DOM.ingestUrlList.value : DOM.ingestSitemapUrl.value).trim();
      const parsedMax = parseInt(DOM.ingestMaxPosts.value, 10);
      const maxPostsVal = Number.isNaN(parsedMax) ? 100 : Math.max(0, parsedMax);

      // Auto-save active project fields so everything entered is persisted
      await autoSaveActiveProject();
      try {
        setIngestRunningUI(true, 'Discovering exact URLs from source...');
        if (DOM.ingestProgressBar) DOM.ingestProgressBar.style.width = '5%';
        if (DOM.ingestProgressCount) DOM.ingestProgressCount.textContent = '0 / ...';
        appendTerminalLog(`Running ingestion & manifest diffing (source=${sourceType}, url=${urlOrList || 'seed'})...`, 'info');
        const customDomainVal = DOM.cfgCfCustomDomain ? DOM.cfgCfCustomDomain.value.trim() : '';
        const workerNameVal = DOM.cfgCfProjectName ? DOM.cfgCfProjectName.value.trim() : '';
        const startRes = await api('/api/ingest', 'POST', {
          source_type: sourceType,
          url_or_list: urlOrList,
          max_posts: maxPostsVal,
          download_images: DOM.ingestDownloadImages.checked,
          force_full_resync: DOM.ingestForceResync.checked,
          cf_custom_domain: customDomainVal,
          custom_domain: customDomainVal,
          cf_project_name: workerNameVal,
          worker_name: workerNameVal,
        });

        if (startRes && startRes.success === false) {
          setIngestRunningUI(false);
          showToast(startRes.error || 'Could not start ingestion.', 'warning');
          return;
        }

        startIngestPolling();
      } catch (err) {
        setIngestRunningUI(false);
        if (state.ingestPollInterval) {
          clearInterval(state.ingestPollInterval);
          state.ingestPollInterval = null;
        }
        showToast(`Ingestion error: ${err.message}`, 'error');
        appendTerminalLog(`Ingestion failure: ${err.message}`, 'error');
      }
    });

    function addDiffRow(slug, title, status, badgeClass) {
      const tr = document.createElement('tr');
      const safeBadgeClass = String(badgeClass || '').replace(/[^a-zA-Z0-9 _-]/g, '');
      tr.innerHTML = `

        <td><span class="badge ${safeBadgeClass}">${escapeHtml(status)}</span></td>

        <td><code>${escapeHtml(slug)}</code></td>

        <td>${escapeHtml(title)}</td>

      `;
      DOM.diffSummaryTableBody.appendChild(tr);
    }

    // Step 1 Progression Guard
    if (DOM.btnStep1Next) {
      DOM.btnStep1Next.addEventListener('click', (e) => {
        e.preventDefault();
        if (state.isIngesting) {
          showToast('⚠️ Ingestion is currently in progress. Please wait for it to complete.', 'warning');
          appendTerminalLog('[NAV GUARD] Cannot proceed to Step 2 while ingestion is actively running.', 'warning');
          return;
        }
        if (!state.posts || state.posts.length === 0) {
          showToast('Proceeding to Step 2 with 0 ingested posts (live sample preview active).', 'info');
        }
        switchTab('tab-themes');
      });
    }

    // Search and Filters
    DOM.postSearchInput.addEventListener('input', () => refreshPosts());
    DOM.postCategoryFilter.addEventListener('change', () => refreshPosts());
    DOM.postStatusFilter.addEventListener('change', () => refreshPosts());
    if (DOM.fetchWorkerPostsBtn) {
      DOM.fetchWorkerPostsBtn.addEventListener('click', () => handleFetchWorkerPosts());
    }

    // Modal Events
    DOM.closeModalBtn.addEventListener('click', closePostEditModal);
    DOM.cancelEditBtn.addEventListener('click', closePostEditModal);
    DOM.postEditModal.addEventListener('click', (e) => {
      if (e.target === DOM.postEditModal) closePostEditModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && DOM.postEditModal.classList.contains('active')) {
        closePostEditModal();
      }
      if (e.key === 'Escape' && DOM.staticPageEditModal && DOM.staticPageEditModal.classList.contains('active')) {
        closeStaticPageModal();
      }
    });
    DOM.editPostForm.addEventListener('submit', (e) => handlePostSave(e, false));
    initRichTextEditor();
    initModelsSubtabsAndHeadCode();
    initCatalogStaticPages();

    // Preview Events
    DOM.previewPostSelect.addEventListener('change', () => {
      state.selectedPostSlug = DOM.previewPostSelect.value;
      const post = state.posts.find((p) => p.slug === state.selectedPostSlug);
      if (post) {
        DOM.previewLiveTitle.value = post.title || '';
      }
      triggerPreview();
    });

    DOM.previewThemeSelect.addEventListener('change', () => triggerPreview());
    DOM.previewRoutingSelect.addEventListener('change', () => triggerPreview());
    if (DOM.previewLiveTitle) {
      DOM.previewLiveTitle.addEventListener('input', () => {
        clearTimeout(state.previewDebounceTimer);
        state.previewDebounceTimer = setTimeout(triggerPreview, 350);
      });
    }

    if (DOM.refreshPreviewBtn) DOM.refreshPreviewBtn.addEventListener('click', () => triggerPreview());

    // Viewport Width Switching
    DOM.viewportBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        DOM.viewportBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        DOM.previewIframe.style.width = btn.getAttribute('data-width');
      });

    });

    // =========================================================================

    // THEME & ROUTING ARCHITECTURE VISUAL PREVIEW GALLERY

    // =========================================================================

    // Theme Card Selection Handler (with immediate persistence)
    document.querySelectorAll('.theme-card').forEach((card) => {
      card.addEventListener('click', async (e) => {
        if (e.target.closest('.btn-preview-theme')) return; // handled by preview modal trigger
        const themeKey = card.dataset.theme;
        syncThemeToUI(themeKey);
        triggerPreview();

        // Update in-memory project and config state immediately
        const curProj = state.projects && state.projects.find((p) => p.id === state.activeProject);
        if (curProj) curProj.theme = themeKey;
        if (state.config && state.config.build) state.config.build.theme = themeKey;
        if (state.status) state.status.theme = themeKey;
        try {
          if (state.activeProject) {
            await api('/api/projects/update', 'POST', {
              project_id: state.activeProject,
              theme: themeKey,
            });
          }
          await api('/api/config', 'POST', {
            build: { theme: themeKey }
          });
          showToast(`Theme set to '${themeKey}'`, 'info');
        } catch (err) {
          console.warn('Auto-save theme failed:', err);
        }
      });
    });

    // Quick Deploy Theme Select Handler (Step 4 Cockpit)
    if (DOM.quickDeployThemeSelect) {
      DOM.quickDeployThemeSelect.addEventListener('change', async () => {
        const themeKey = DOM.quickDeployThemeSelect.value;
        syncThemeToUI(themeKey);
        triggerPreview();

        // Update in-memory project and config state immediately
        const curProj = state.projects && state.projects.find((p) => p.id === state.activeProject);
        if (curProj) curProj.theme = themeKey;
        if (state.config && state.config.build) state.config.build.theme = themeKey;
        if (state.status) state.status.theme = themeKey;
        try {
          if (state.activeProject) {
            await api('/api/projects/update', 'POST', {
              project_id: state.activeProject,
              theme: themeKey,
            });
          }
          await api('/api/config', 'POST', {
            build: { theme: themeKey }
          });
          showToast(`Deploy theme set to '${themeKey}'`, 'info');
        } catch (err) {
          console.warn('Auto-save deploy theme failed:', err);
        }
      });
    }

    // Routing Card Selection Handler (with immediate persistence)
    document.querySelectorAll('.routing-card').forEach((card) => {
      card.addEventListener('click', async () => {
        const routeKey = card.dataset.routing;
        document.querySelectorAll('.routing-card').forEach((c) => c.classList.remove('active'));
        card.classList.add('active');
        if (DOM.cfgRoutingMode) DOM.cfgRoutingMode.value = routeKey;
        if (DOM.previewRoutingSelect) DOM.previewRoutingSelect.value = routeKey;
        triggerPreview();
        try {
          if (state.activeProject) {
            await api('/api/projects/update', 'POST', {
              project_id: state.activeProject,
              routing_mode: routeKey,
            });
          }
          await api('/api/config', 'POST', {
            build: { routing_mode: routeKey }
          });
          showToast(`Routing mode set to '${routeKey}'`, 'info');
        } catch (err) {
          console.warn('Auto-save routing mode failed:', err);
        }
      });
    });

    // Open Fullscreen Template Preview Modal & Live Visual Customizer
    let modalPreviewReqSeq = 0;

    function cloneThemeCustomizations(raw) {
      const src = raw && typeof raw === 'object' ? raw : {};
      const blocks = Array.isArray(src.content_blocks)
        ? src.content_blocks.map((b, idx) => ({
            id: String(b?.id || `block-${Date.now()}-${idx}`),
            eyebrow: String(b?.eyebrow || ''),
            title: String(b?.title || ''),
            body: String(b?.body || ''),
            image_url: String(b?.image_url || ''),
            image_alt: String(b?.image_alt || ''),
            layout: b?.layout === 'image-right' ? 'image-right' : 'image-left',
            position:
              b?.position === 'after-hero' || b?.position === 'before-footer'
                ? b.position
                : 'before-newsletter',
            cta_label: String(b?.cta_label || ''),
            cta_url: String(b?.cta_url || ''),
          }))
        : [];
      return {
        hero_title: String(src.hero_title || ''),
        hero_subtitle: String(src.hero_subtitle || ''),
        categories_title: String(src.categories_title || ''),
        latest_title: String(src.latest_title || ''),
        newsletter_title: String(src.newsletter_title || ''),
        newsletter_copy: String(src.newsletter_copy || ''),
        footer_description: String(src.footer_description || ''),
        footer_copyright: String(src.footer_copyright || ''),
        footer_email: String(src.footer_email || ''),
        content_blocks: blocks,
      };
    }

    function setThemeEdStatus(label) {
      if (DOM.themeEdLiveStatus) DOM.themeEdLiveStatus.textContent = label;
    }

    function escapeAttr(val) {
      return String(val ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    function readDraftFromInputs() {
      const d = state.themeCustomDraft || cloneThemeCustomizations({});
      if (DOM.teHeroTitle) d.hero_title = DOM.teHeroTitle.value;
      if (DOM.teHeroSubtitle) d.hero_subtitle = DOM.teHeroSubtitle.value;
      if (DOM.teCategoriesTitle) d.categories_title = DOM.teCategoriesTitle.value;
      if (DOM.teLatestTitle) d.latest_title = DOM.teLatestTitle.value;
      if (DOM.teNewsletterTitle) d.newsletter_title = DOM.teNewsletterTitle.value;
      if (DOM.teNewsletterCopy) d.newsletter_copy = DOM.teNewsletterCopy.value;
      if (DOM.teFooterDesc) d.footer_description = DOM.teFooterDesc.value;
      if (DOM.teFooterCopyright) d.footer_copyright = DOM.teFooterCopyright.value;
      if (DOM.teFooterEmail) d.footer_email = DOM.teFooterEmail.value;
      state.themeCustomDraft = d;
      return d;
    }

    function syncThemeEditorInputsFromDraft() {
      const d = state.themeCustomDraft || cloneThemeCustomizations({});
      if (DOM.teHeroTitle) DOM.teHeroTitle.value = d.hero_title || '';
      if (DOM.teHeroSubtitle) DOM.teHeroSubtitle.value = d.hero_subtitle || '';
      if (DOM.teCategoriesTitle) DOM.teCategoriesTitle.value = d.categories_title || '';
      if (DOM.teLatestTitle) DOM.teLatestTitle.value = d.latest_title || '';
      if (DOM.teNewsletterTitle) DOM.teNewsletterTitle.value = d.newsletter_title || '';
      if (DOM.teNewsletterCopy) DOM.teNewsletterCopy.value = d.newsletter_copy || '';
      if (DOM.teFooterDesc) DOM.teFooterDesc.value = d.footer_description || '';
      if (DOM.teFooterCopyright) DOM.teFooterCopyright.value = d.footer_copyright || '';
      if (DOM.teFooterEmail) DOM.teFooterEmail.value = d.footer_email || '';
      renderThemeBlocksEditor();
    }

    function renderThemeBlocksEditor() {
      if (!DOM.themeBlocksList) return;
      const blocks = Array.isArray(state.themeCustomDraft?.content_blocks)
        ? state.themeCustomDraft.content_blocks
        : [];
      if (DOM.themeBlocksCount) {
        DOM.themeBlocksCount.textContent = `${blocks.length} ${blocks.length === 1 ? 'block' : 'blocks'}`;
      }
      if (!blocks.length) {
        DOM.themeBlocksList.innerHTML =
          '<div class="theme-blocks-empty">No custom Image + Text blocks yet.<br/>Click <strong>+ Add Image + Text Block</strong> above to insert a split visual section on your homepage.</div>';
        return;
      }

      DOM.themeBlocksList.innerHTML = blocks
        .map((blk, idx) => {
          const num = idx + 1;
          const uid = escapeAttr(blk.id || `block-${idx}`);
          const thumbHtml = blk.image_url
            ? `<img class="theme-block-thumb" src="${escapeAttr(blk.image_url)}" alt="${escapeAttr(blk.image_alt || blk.title || 'Block preview')}" />`
            : `<div class="theme-block-thumb-placeholder">No img</div>`;
          return `
            <div class="theme-block-card" data-block-index="${idx}">
              <div class="theme-block-card-head">
                <span class="theme-block-card-title">Block #${num}${blk.title ? ' · ' + escapeAttr(blk.title) : ''}</span>
                <div class="theme-block-card-actions">
                  <button type="button" data-action="up" data-idx="${idx}" aria-label="Move block ${num} up" ${idx === 0 ? 'disabled' : ''}>↑</button>
                  <button type="button" data-action="down" data-idx="${idx}" aria-label="Move block ${num} down" ${idx === blocks.length - 1 ? 'disabled' : ''}>↓</button>
                  <button type="button" class="btn-del-block" data-action="delete" data-idx="${idx}" aria-label="Delete block ${num}">✕</button>
                </div>
              </div>

              <div class="theme-block-img-row">
                ${thumbHtml}
                <div class="theme-block-upload-wrap">
                  <label class="theme-block-upload-btn" for="blkFile-${uid}">
                    <span>📷 Upload Image</span>
                    <input type="file" id="blkFile-${uid}" data-block-upload="${idx}" accept="image/png,image/jpeg,image/webp,image/svg+xml" style="display: none;" />
                  </label>
                  <span style="font-size: 0.68rem; color: #64748b;">PNG, JPG, WebP or SVG · or paste URL below</span>
                </div>
              </div>

              <div class="theme-ed-field">
                <label for="blkImgUrl-${uid}">Image URL</label>
                <input type="text" id="blkImgUrl-${uid}" data-block-field="image_url" data-idx="${idx}" value="${escapeAttr(blk.image_url)}" placeholder="/assets/images/... or https://..." />
              </div>

              <div class="theme-block-grid-2">
                <div class="theme-ed-field">
                  <label for="blkLayout-${uid}">Layout</label>
                  <select id="blkLayout-${uid}" data-block-field="layout" data-idx="${idx}">
                    <option value="image-left" ${blk.layout === 'image-left' ? 'selected' : ''}>Image Left</option>
                    <option value="image-right" ${blk.layout === 'image-right' ? 'selected' : ''}>Image Right</option>
                  </select>
                </div>
                <div class="theme-ed-field">
                  <label for="blkPos-${uid}">Placement</label>
                  <select id="blkPos-${uid}" data-block-field="position" data-idx="${idx}">
                    <option value="after-hero" ${blk.position === 'after-hero' ? 'selected' : ''}>After Hero</option>
                    <option value="before-newsletter" ${blk.position === 'before-newsletter' ? 'selected' : ''}>Before Newsletter</option>
                    <option value="before-footer" ${blk.position === 'before-footer' ? 'selected' : ''}>Above Footer</option>
                  </select>
                </div>
              </div>

              <div class="theme-ed-field">
                <label for="blkEyebrow-${uid}">Eyebrow / Kicker (Optional)</label>
                <input type="text" id="blkEyebrow-${uid}" data-block-field="eyebrow" data-idx="${idx}" maxlength="80" value="${escapeAttr(blk.eyebrow)}" placeholder="e.g. Our Philosophy" />
              </div>

              <div class="theme-ed-field">
                <label for="blkTitle-${uid}">Block Heading</label>
                <input type="text" id="blkTitle-${uid}" data-block-field="title" data-idx="${idx}" maxlength="160" value="${escapeAttr(blk.title)}" placeholder="e.g. Designed for Calm, Everyday Living" />
              </div>

              <div class="theme-ed-field">
                <label for="blkBody-${uid}">Block Text</label>
                <textarea id="blkBody-${uid}" rows="3" data-block-field="body" data-idx="${idx}" maxlength="1800" placeholder="Write a short paragraph to appear beside your image...">${escapeAttr(blk.body)}</textarea>
              </div>

              <div class="theme-block-grid-2">
                <div class="theme-ed-field">
                  <label for="blkCtaLabel-${uid}">Button Text (Optional)</label>
                  <input type="text" id="blkCtaLabel-${uid}" data-block-field="cta_label" data-idx="${idx}" maxlength="60" value="${escapeAttr(blk.cta_label)}" placeholder="e.g. Read Our Story" />
                </div>
                <div class="theme-ed-field">
                  <label for="blkCtaUrl-${uid}">Button Link</label>
                  <input type="text" id="blkCtaUrl-${uid}" data-block-field="cta_url" data-idx="${idx}" maxlength="300" value="${escapeAttr(blk.cta_url)}" placeholder="e.g. /about/" />
                </div>
              </div>
            </div>
          `;
        })
        .join('');
    }

    async function renderTemplateModalPreview(preserveScroll = false) {
      const reqId = ++modalPreviewReqSeq;
      const theme = state.modalActiveTheme || 'nordic-studio';
      const routing = state.modalActiveRouting || 'single';
      const viewMode = state.modalActiveView || 'hub';
      setThemeEdStatus('Updating preview...');

      let prevScrollY = 0;
      if (preserveScroll && DOM.templateModalIframe) {
        try {
          prevScrollY = DOM.templateModalIframe.contentWindow?.scrollY || 0;
        } catch {
          prevScrollY = 0;
        }
      }

      try {
        const samplePayload = {
          theme,
          routing_mode: routing,
          view_mode: viewMode,
          theme_customizations: state.themeCustomDraft,
        };

        if (viewMode === 'post') {
          samplePayload.post = {
            slug: 'modern-room-styling-guide',
            title: 'Modern Scandinavian Living Room Design: 15 Warm Minimalist Ideas',
            excerpt: 'Transform your main living space with organic textures, functional hidden storage, and warm lighting layers designed for everyday comfort.',
            category: 'Living Room Styling',
            category_slug: 'living-room',
            parent_slug: 'home-organization',
            date: '2026-11-02',
            takeaways: [
              'Balanced Room Proportions: Anchor your layout with clean-lined low profile seating.',
              'Layered Textures: Blend natural oak, boucle, and linen for Scandinavian warmth.',
              'Intentional Lighting: Use 3 light sources at varying heights to eliminate dark corners.',
            ],
            checklist: [
              { id: 'step-1', text: 'Measure room footprint and map primary natural light windows' },
              { id: 'step-2', text: 'Select foundational neutral furniture pieces (boucle, warm oak)' },
              { id: 'step-3', text: 'Install warm-toned 2700K ambient and task lighting fixtures' },
            ],
          };
        }

        const res = await api('/api/preview', 'POST', samplePayload);
        if (reqId !== modalPreviewReqSeq) return;
        if (res.html && DOM.templateModalIframe) {
          if (preserveScroll && prevScrollY > 0) {
            DOM.templateModalIframe.onload = () => {
              try {
                DOM.templateModalIframe.contentWindow?.scrollTo(0, prevScrollY);
              } catch {
                // Ignore cross-origin scroll restore errors
              }
              DOM.templateModalIframe.onload = null;
            };
          } else {
            DOM.templateModalIframe.onload = null;
          }
          DOM.templateModalIframe.srcdoc = res.html;
        }
        setThemeEdStatus(state.themeEditorDirty ? 'Unsaved draft' : 'Live preview ready');
      } catch (err) {
        if (reqId !== modalPreviewReqSeq) return;
        setThemeEdStatus('Preview error');
        showToast(`Template preview render failed: ${err.message}`, 'error');
      }
    }

    function scheduleTemplateModalPreview(immediate = false, preserveScroll = true) {
      if (state.themeEditorDebounceTimer) {
        clearTimeout(state.themeEditorDebounceTimer);
        state.themeEditorDebounceTimer = null;
      }
      state.themeEditorDirty = true;
      setThemeEdStatus('Updating preview...');
      if (immediate) {
        renderTemplateModalPreview(preserveScroll);
      } else {
        state.themeEditorDebounceTimer = setTimeout(() => {
          state.themeEditorDebounceTimer = null;
          renderTemplateModalPreview(preserveScroll);
        }, 240);
      }
    }

    async function openTemplateModal(themeKey, routingKey, defaultView = 'hub', preserveDraft = false) {
      const theme = themeKey || (DOM.cfgTheme && DOM.cfgTheme.value) || 'nordic-studio';
      const routing = routingKey || (DOM.cfgRoutingMode && DOM.cfgRoutingMode.value) || 'single';
      state.modalActiveTheme = theme;
      state.modalActiveRouting = routing;
      state.modalActiveView = defaultView || 'hub';

      if (!preserveDraft) {
        const savedCustom = state.config?.branding?.theme_customizations;
        state.themeCustomDraft = cloneThemeCustomizations(savedCustom);
        state.themeEditorDirty = false;
        syncThemeEditorInputsFromDraft();
      }

      // Synchronize modal view toggle buttons
      document.querySelectorAll('.modal-view-btn').forEach((btn) => {
        if (btn.dataset.view === state.modalActiveView) {
          btn.classList.add('active', 'btn-primary');
          btn.classList.remove('btn-secondary');
        } else {
          btn.classList.remove('active', 'btn-primary');
          btn.classList.add('btn-secondary');
        }
      });

      const themeNames = {
        'editorial-warm': 'Model 1 · Kinfolk Journal',
        'nordic-studio': 'The Nordroom (Scandinavian Minimalist)',
        'pinterest-mag': 'Model 3 · Botanical Atelier (Forest & Gold Magazine)',
      };

      const routingNames = {
        'single': 'Single Slug (/<slug>/)',
        'category_slug': 'Category Slug (/<category>/<slug>/)',
        'parent_slug': 'Parent Slug (/<parent>/<slug>/)',
        'silo_nested': 'Silo Nested (/guides/<parent>/<slug>/)',
        'pseo_nested_silo': 'pSEO Silo (/blog/<slug>/ + /category/<cat>/)',
      };

      if (DOM.templateModalThemeBadge) {
        DOM.templateModalThemeBadge.textContent = themeNames[theme] || theme;
      }

      if (DOM.templateModalRoutingBadge) {
        DOM.templateModalRoutingBadge.textContent = routingNames[routing] || routing;
      }

      if (DOM.templatePreviewModal) {
        DOM.templatePreviewModal.classList.add('active');
      }
      await renderTemplateModalPreview(false);
    }

    // Sidebar Toggle Button
    if (DOM.toggleThemeEditorBtn && DOM.templateModalWorkspace) {
      DOM.toggleThemeEditorBtn.addEventListener('click', () => {
        const collapsed = DOM.templateModalWorkspace.classList.toggle('editor-collapsed');
        DOM.toggleThemeEditorBtn.classList.toggle('active', !collapsed);
        DOM.toggleThemeEditorBtn.setAttribute('aria-expanded', String(!collapsed));
      });
    }

    // Sidebar Tab Switching (Titles / Image & Text / Footer)
    document.querySelectorAll('.theme-ed-tab').forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        const target = tabBtn.dataset.edTab;
        if (!target) return;
        document.querySelectorAll('.theme-ed-tab').forEach((b) => {
          const isMatch = b.dataset.edTab === target;
          b.classList.toggle('active', isMatch);
          b.setAttribute('aria-selected', String(isMatch));
        });
        document.querySelectorAll('.theme-ed-panel').forEach((panel) => {
          panel.classList.toggle('active', panel.dataset.edPanel === target);
        });
      });
    });

    // Live Input Bindings for Titles & Footer
    [
      DOM.teHeroTitle,
      DOM.teHeroSubtitle,
      DOM.teCategoriesTitle,
      DOM.teLatestTitle,
      DOM.teNewsletterTitle,
      DOM.teNewsletterCopy,
      DOM.teFooterDesc,
      DOM.teFooterCopyright,
      DOM.teFooterEmail,
    ].forEach((inputEl) => {
      if (!inputEl) return;
      inputEl.addEventListener('input', () => {
        readDraftFromInputs();
        scheduleTemplateModalPreview(false, true);
      });
    });

    // Add Image + Text Block
    if (DOM.btnAddThemeBlock) {
      DOM.btnAddThemeBlock.addEventListener('click', () => {
        const blocks = state.themeCustomDraft.content_blocks || [];
        if (blocks.length >= 12) {
          showToast('Maximum of 12 Image + Text blocks reached.', 'warning');
          return;
        }
        const firstPost = Array.isArray(state.posts)
          ? state.posts.find((p) => p && (p.local_image_path || p.image_url))
          : null;
        const firstPostImg = (firstPost && (firstPost.local_image_path || firstPost.image_url)) || '';
        blocks.push({
          id: `block-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          eyebrow: 'Featured Story',
          title: 'Crafted Spaces for Everyday Calm',
          body: 'Combine natural textures, warm lighting, and thoughtful storage to bring timeless character into every corner of your home.',
          image_url: firstPostImg,
          image_alt: 'Featured interior detail',
          layout: blocks.length % 2 === 0 ? 'image-left' : 'image-right',
          position: blocks.length === 0 ? 'after-hero' : 'before-newsletter',
          cta_label: 'Explore Our Guide',
          cta_url: '/about/',
        });
        state.themeCustomDraft.content_blocks = blocks;
        renderThemeBlocksEditor();
        scheduleTemplateModalPreview(true, true);
      });
    }

    // Delegated Events for Image + Text Block Cards (edit fields, reorder, delete, upload image)
    if (DOM.themeBlocksList) {
      DOM.themeBlocksList.addEventListener('input', (e) => {
        const target = e.target;
        if (!target || !target.dataset || !target.dataset.blockField) return;
        const idx = Number(target.dataset.idx);
        const field = target.dataset.blockField;
        const blocks = state.themeCustomDraft?.content_blocks;
        if (!Array.isArray(blocks) || !blocks[idx]) return;
        blocks[idx][field] = target.value;
        if (field === 'title') {
          const card = target.closest('.theme-block-card');
          const headTitle = card && card.querySelector('.theme-block-card-title');
          if (headTitle) headTitle.textContent = `Block #${idx + 1}${target.value ? ' · ' + target.value : ''}`;
        }
        if (field === 'image_url') {
          const card = target.closest('.theme-block-card');
          const imgRow = card && card.querySelector('.theme-block-img-row');
          if (imgRow) {
            const existingThumb = imgRow.querySelector('.theme-block-thumb, .theme-block-thumb-placeholder');
            if (existingThumb) {
              const cleanUrl = target.value.trim();
              if (cleanUrl) {
                const img = document.createElement('img');
                img.className = 'theme-block-thumb';
                img.src = toSpaceAssetUrl(cleanUrl);
                img.alt = blocks[idx].image_alt || blocks[idx].title || 'Block preview';
                existingThumb.replaceWith(img);
              } else {
                const ph = document.createElement('div');
                ph.className = 'theme-block-thumb-placeholder';
                ph.textContent = 'No img';
                existingThumb.replaceWith(ph);
              }
            }
          }
        }
        scheduleTemplateModalPreview(false, true);
      });

      DOM.themeBlocksList.addEventListener('change', async (e) => {
        const target = e.target;
        if (!target || !target.dataset) return;
        // Select dropdowns (layout / position)
        if (target.dataset.blockField && target.tagName === 'SELECT') {
          const idx = Number(target.dataset.idx);
          const blocks = state.themeCustomDraft?.content_blocks;
          if (!Array.isArray(blocks) || !blocks[idx]) return;
          blocks[idx][target.dataset.blockField] = target.value;
          scheduleTemplateModalPreview(true, true);
          return;
        }
        // Image file upload
        if (target.dataset.blockUpload !== undefined) {
          const idx = Number(target.dataset.blockUpload);
          const file = target.files && target.files[0];
          const blocks = state.themeCustomDraft?.content_blocks;
          if (!file || !Array.isArray(blocks) || !blocks[idx]) return;
          try {
            setThemeEdStatus('Uploading image...');
            const dataUrl = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result || ''));
              reader.onerror = () => reject(new Error('Could not read selected file.'));
              reader.readAsDataURL(file);
            });
            const uploaded = await api('/api/upload-block-image', 'POST', {
              data: dataUrl,
              filename: file.name,
            });
            if (uploaded.image_url) {
              blocks[idx].image_url = uploaded.image_url;
              if (!blocks[idx].image_alt) {
                blocks[idx].image_alt = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
              }
              renderThemeBlocksEditor();
              scheduleTemplateModalPreview(true, true);
              showToast('Block image uploaded & optimized.', 'success');
            }
          } catch (err) {
            setThemeEdStatus('Upload failed');
            showToast(`Image upload failed: ${err.message}`, 'error');
          } finally {
            target.value = '';
          }
        }
      });

      DOM.themeBlocksList.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest('button[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const idx = Number(btn.dataset.idx);
        const blocks = state.themeCustomDraft?.content_blocks;
        if (!Array.isArray(blocks) || idx < 0 || idx >= blocks.length) return;
        if (action === 'up' && idx > 0) {
          const tmp = blocks[idx - 1];
          blocks[idx - 1] = blocks[idx];
          blocks[idx] = tmp;
        } else if (action === 'down' && idx < blocks.length - 1) {
          const tmp = blocks[idx + 1];
          blocks[idx + 1] = blocks[idx];
          blocks[idx] = tmp;
        } else if (action === 'delete') {
          blocks.splice(idx, 1);
        } else {
          return;
        }
        renderThemeBlocksEditor();
        scheduleTemplateModalPreview(true, true);
      });
    }

    // Reset Edits Button (clears custom overrides in draft)
    if (DOM.btnResetThemeEdits) {
      DOM.btnResetThemeEdits.addEventListener('click', () => {
        state.themeCustomDraft = cloneThemeCustomizations({});
        syncThemeEditorInputsFromDraft();
        scheduleTemplateModalPreview(true, false);
        showToast('Draft theme edits reset to theme defaults. Click Save & Apply to persist.', 'info');
      });
    }

    // Modal View Toggle Triggers
    document.querySelectorAll('.modal-view-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const view = btn.dataset.view;
        if (!view) return;
        openTemplateModal(state.modalActiveTheme, state.modalActiveRouting, view, true);
      });
    });

    // Modal Close Triggers
    if (DOM.closeTemplateModalBtn) {
      DOM.closeTemplateModalBtn.addEventListener('click', () => {
        if (DOM.templatePreviewModal) DOM.templatePreviewModal.classList.remove('active');
      });
    }

    if (DOM.templatePreviewModal) {
      DOM.templatePreviewModal.addEventListener('click', (e) => {
        if (e.target === DOM.templatePreviewModal) {
          DOM.templatePreviewModal.classList.remove('active');
        }
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && DOM.templatePreviewModal && DOM.templatePreviewModal.classList.contains('active')) {
        DOM.templatePreviewModal.classList.remove('active');
      }
    });

    // Viewport Width Switching inside Modal
    document.querySelectorAll('.modal-vp-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.modal-vp-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        if (DOM.templateModalIframe) {
          DOM.templateModalIframe.style.width = btn.getAttribute('data-width');
        }
      });
    });

    // "Save & Apply Theme" inside Preview Modal (persists Theme + Titles + Image/Text Blocks + Footer)
    if (DOM.applyTemplateThemeBtn) {
      DOM.applyTemplateThemeBtn.addEventListener('click', async () => {
        const chosen = state.modalActiveTheme || 'nordic-studio';
        const customPayload = readDraftFromInputs();
        syncThemeToUI(chosen);
        const curProj = state.projects && state.projects.find((p) => p.id === state.activeProject);
        if (curProj) {
          curProj.theme = chosen;
          curProj.theme_customizations = cloneThemeCustomizations(customPayload);
        }
        if (state.config && state.config.build) state.config.build.theme = chosen;
        if (state.config && state.config.branding) {
          state.config.branding.theme_customizations = cloneThemeCustomizations(customPayload);
        }
        if (state.status) state.status.theme = chosen;
        try {
          if (state.activeProject) {
            await api('/api/projects/update', 'POST', {
              project_id: state.activeProject,
              theme: chosen,
              theme_customizations: customPayload,
            });
          }
          const saved = await api('/api/config', 'POST', {
            build: { theme: chosen },
            branding: { theme_customizations: customPayload },
          });
          if (saved && saved.config && saved.config.branding) {
            state.config.branding.theme_customizations = cloneThemeCustomizations(
              saved.config.branding.theme_customizations
            );
          }
          state.themeEditorDirty = false;
          setThemeEdStatus('Saved');
          triggerPreview();
          showToast(`Theme & customizations saved for ${chosen}.`, 'success');
        } catch (err) {
          showToast(`Theme applied locally, but save failed: ${err.message}`, 'warning');
        }
        if (DOM.templatePreviewModal) DOM.templatePreviewModal.classList.remove('active');
      });
    }

    // Theme Card Direct Preview Buttons
    document.querySelectorAll('.btn-preview-theme').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const theme = btn.dataset.theme;
        openTemplateModal(theme);
      });

    });

    // Header "Open Fullscreen Template Preview" Button
    if (DOM.btnOpenThemePreview) {
      DOM.btnOpenThemePreview.addEventListener('click', () => {
        openTemplateModal(DOM.cfgTheme?.value, DOM.cfgRoutingMode?.value);
      });

    }

    // Asset Sync Trigger

    async function handleSyncAssets() {
      try {
        await autoSaveActiveProject();
        const customDomainVal = DOM.cfgCfCustomDomain ? DOM.cfgCfCustomDomain.value.trim() : '';
        const workerNameVal = DOM.cfgCfProjectName ? DOM.cfgCfProjectName.value.trim() : '';
        showToast('Syncing all post image assets to project...', 'info');
        appendTerminalLog('[ASSETS] Scanning posts and downloading missing featured images to assets/images/...', 'info');
        const res = await api('/api/assets/sync', 'POST', {
          force: false,
          cf_custom_domain: customDomainVal,
          custom_domain: customDomainVal,
          cf_project_name: workerNameVal,
          worker_name: workerNameVal,
        });

        if (res.success) {
          showToast(`Saved ${res.total} image assets to project (${res.downloaded} downloaded, ${res.generated_svg} SVGs)!`, 'success');
          appendTerminalLog(`[ASSETS] Completed: ${res.total} image assets verified in assets/images/ (${res.downloaded} newly downloaded, ${res.generated_svg} SVGs generated).`, 'info');
          await refreshSystem();
          await refreshPosts();
        } else {
          showToast(res.error || 'Failed to sync assets', 'error');
        }
      } catch (err) {
        showToast(`Asset Sync Error: ${err.message}`, 'error');
        appendTerminalLog(`[ERROR] Asset sync failed: ${err.message}`, 'error');
      }
    }

    if (DOM.syncAssetsBtn) DOM.syncAssetsBtn.addEventListener('click', handleSyncAssets);
    if (DOM.syncAssetsDeployBtn) DOM.syncAssetsDeployBtn.addEventListener('click', handleSyncAssets);
    if (DOM.syncAssetsSettingsBtn) DOM.syncAssetsSettingsBtn.addEventListener('click', handleSyncAssets);

    // WebP Image Optimization Trigger
    if (DOM.optimizeWebpBtn) {
      DOM.optimizeWebpBtn.addEventListener('click', async () => {
        try {
          showToast('Optimizing images in assets/images/ to standard WebP...', 'info');
          appendTerminalLog('[WEBP] Optimizing images to standard 16:10 WebP...', 'info');
          const res = await api('/api/images/optimize', 'POST', { quality: 82 });
          if (res.success) {
            const stats = res.stats || {};
            const msg = `WebP complete: ${stats.converted || 0} images converted (${stats.percent_reduction || 0}% space saved).`;
            showToast(msg, 'success');
            appendTerminalLog(`[WEBP SUCCESS] ${msg}`, 'success');
            refreshSystem();
          } else {
            showToast('Optimization failed', 'error');
          }
        } catch (err) {
          showToast(`Optimization error: ${err.message}`, 'error');
          appendTerminalLog(`[WEBP ERROR] ${err.message}`, 'error');
        }
      });

    }

    // Build Trigger

    async function executeBuild() {
      const isCf = currentPlatformMode === 'cloudflare';
      const activePlatform = isCf ? 'cloudflare' : 'github';
      const activeBtn = isCf ? DOM.triggerBuildBtn : DOM.triggerBuildGhBtn;
      const defaultBtnHtml = isCf ? '<span>🔨 Build Static Site</span>' : '🔨 Build for GitHub';
      const progressBox = isCf ? DOM.buildProgressBarContainer : DOM.ghBuildProgressBarContainer;
      const progressBar = isCf ? DOM.buildProgressBar : DOM.ghBuildProgressBar;
      const progressPct = isCf ? DOM.buildProgressPercent : DOM.ghBuildProgressPercent;
      const progressLabel = isCf ? DOM.buildProgressLabel : DOM.ghBuildProgressLabel;

      if (activeBtn) {
        activeBtn.disabled = true;
        activeBtn.innerHTML = '<span>⏳ Compiling...</span>';
      }
      if (progressBox) {
        progressBox.style.display = 'block';
        if (progressBar) progressBar.style.width = '30%';
        if (progressPct) progressPct.textContent = '30%';
        if (progressLabel) progressLabel.textContent = 'Compiling HTML templates, XML sitemaps & schemas...';
      }
      try {
        appendTerminalLog(`[BUILD] Starting static compilation for ${activePlatform}...`, 'info');
        const workerInput = document.getElementById('cfgCfProjectName')?.value?.trim();
        const activeProject = isCf
          ? (workerInput || state.activeProject || 'stylesdays')
          : (DOM.cfgStep1GithubOwner?.value?.trim() || state.config?.github?.owner || state.activeProject || 'stylesdays');
        if (progressBar) progressBar.style.width = '65%';
        if (progressPct) progressPct.textContent = '65%';
        if (progressLabel) progressLabel.textContent = 'Generating routes, static pages, sitemap.xml & JSON-LD schemas...';
        const currentTheme = (DOM.quickDeployThemeSelect && DOM.quickDeployThemeSelect.value) || (DOM.cfgTheme && DOM.cfgTheme.value) || undefined;
        const currentRouting = (DOM.cfgRoutingMode && DOM.cfgRoutingMode.value) || undefined;
        const res = await api('/api/build', 'POST', {
          clean: true,
          target_cloud: activePlatform,
          project_name: activeProject,
          theme: currentTheme,
          routing_mode: currentRouting
        });

        const assetMsg = res.assets_copied ? ` (${res.assets_copied} image assets copied)` : '';
        if (progressBar) progressBar.style.width = '100%';
        if (progressPct) progressPct.textContent = '100%';
        if (progressLabel) progressLabel.textContent = `✅ Build complete: ${res.files_generated} files generated!`;
        showToast(`Build complete: ${res.files_generated} files generated${assetMsg}.`, 'success');
        appendTerminalLog(`[BUILD SUCCESS] Generated ${res.files_generated} static files in ${res.output_dir}${assetMsg}`, 'success');
        await refreshSystem();
        setTimeout(() => {
          if (progressBox) progressBox.style.display = 'none';
          if (activeBtn) {
            activeBtn.disabled = false;
            activeBtn.innerHTML = defaultBtnHtml;
          }
        }, 2500);
      } catch (err) {
        if (progressLabel) progressLabel.textContent = `❌ Build failed: ${err.message}`;
        if (activeBtn) {
          activeBtn.disabled = false;
          activeBtn.innerHTML = defaultBtnHtml;
        }
        showToast(`Build failed: ${err.message}`, 'error');
        appendTerminalLog(`[BUILD ERROR] ${err.message}`, 'error');
      }
    }

    if (DOM.triggerBuildBtn) DOM.triggerBuildBtn.addEventListener('click', executeBuild);

    function renderTerminalLogs(logs) {
      if (Array.isArray(logs)) {
        cachedTerminalLogs = logs.slice();
      }
      if (!DOM.terminalBody) return;
      DOM.terminalBody.innerHTML = '';
      let rendered = 0;
      cachedTerminalLogs.forEach((line) => {
        if (!matchesTerminalFilter(line, currentTerminalFilter)) return;
        const lower = String(line || '').toLowerCase();
        let cls = 'log-info';
        if (lower.includes('error') || lower.includes('fail') || lower.includes('fatal')) cls = 'log-error';
        else if (lower.includes('success') || lower.includes('deployed') || lower.includes('verified')) cls = 'log-success';
        const div = document.createElement('div');
        div.className = cls;
        div.textContent = line;
        DOM.terminalBody.appendChild(div);
        rendered += 1;
      });
      if (rendered === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'log-info';
        emptyDiv.textContent = `[INFO] No log entries match filter '${currentTerminalFilter}'.`;
        DOM.terminalBody.appendChild(emptyDiv);
      }

      DOM.terminalBody.scrollTop = DOM.terminalBody.scrollHeight;
    }

    function startLogPolling(onFinished) {
      if (state.logPollInterval) clearInterval(state.logPollInterval);
      state.logPollInterval = setInterval(async () => {
        try {
          const statusRes = await api('/api/deploy/logs');
          if (statusRes.logs && statusRes.logs.length) {
            renderTerminalLogs(statusRes.logs);
          }

          const pct = Number(statusRes.percent || (statusRes.job && statusRes.job.percent) || 25);
          const msg = statusRes.message || (statusRes.job && statusRes.job.message) || 'Deploying to GitHub Pages...';
          if (DOM.ghDeployProgressBar) {
            DOM.ghDeployProgressBar.style.width = `${Math.min(98, Math.max(15, pct))}%`;
          }
          if (DOM.ghDeployProgressPercent) {
            DOM.ghDeployProgressPercent.textContent = `${pct}%`;
          }
          if (DOM.ghDeployProgressLabel) {
            DOM.ghDeployProgressLabel.textContent = msg;
          }

          if (statusRes.status === 'success' || statusRes.status === 'failed' || statusRes.status === 'error') {
            clearInterval(state.logPollInterval);
            state.logPollInterval = null;
            if (onFinished) onFinished(statusRes.status === 'success', statusRes);
          }
        } catch (e) {}
      }, 900);
    }

    // Terminal Filter Buttons
    if (DOM.termFilterBtns) {
      DOM.termFilterBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          DOM.termFilterBtns.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          currentTerminalFilter = btn.getAttribute('data-filter') || 'all';
          renderTerminalLogs();
        });
      });
    }

    // Copy Terminal Logs
    if (DOM.copyLogsBtn) {
      DOM.copyLogsBtn.addEventListener('click', () => {
        const text = DOM.terminalBody ? DOM.terminalBody.innerText : '';
        if (navigator.clipboard && text) {
          navigator.clipboard.writeText(text).then(() => {
            showToast('Deployment logs copied to clipboard!', 'success');
          }).catch(() => {
            showToast('Unable to copy logs to clipboard.', 'error');
          });
        }
      });
    }

    // Deploy Trigger: GitHub Pages
    DOM.triggerDeployBtn.addEventListener('click', async () => {
      if (state.isDeploying) {
        showToast('Deployment is already in progress...', 'warning');
        return;
      }
      const dryRun = DOM.deployDryRun ? DOM.deployDryRun.checked : false;
      const ghOwner = DOM.cfgStep1GithubOwner?.value?.trim() || state.config?.github?.owner || state.activeProject || '';
      state.isDeploying = true;
      if (DOM.triggerDeployBtn) {
        DOM.triggerDeployBtn.disabled = true;
        DOM.triggerDeployBtn.innerHTML = '<span>⏳ Deploying to GitHub...</span>';
      }
      if (DOM.ghDeployProgressBarContainer) {
        DOM.ghDeployProgressBarContainer.style.display = 'block';
        if (DOM.ghDeployProgressBar) DOM.ghDeployProgressBar.style.width = '15%';
        if (DOM.ghDeployProgressPercent) DOM.ghDeployProgressPercent.textContent = '15%';
        if (DOM.ghDeployProgressLabel) DOM.ghDeployProgressLabel.textContent = 'Initiating GitHub Pages deployment...';
      }
      try {
        appendTerminalLog(`[GITHUB] Initiating Pages deployment (owner=${ghOwner || 'default'}, dry_run=${dryRun})...`, 'info');
        const res = await api('/api/deploy', 'POST', {
          dry_run: dryRun,
          project_name: ghOwner
        });

        if (res.success === false) {
          throw new Error(res.error || 'GitHub deployment failed to start.');
        }

        showToast(res.message || 'GitHub deployment started.', 'info');
        startLogPolling((success, statusRes) => {
          state.isDeploying = false;
          if (DOM.ghDeployProgressBar) DOM.ghDeployProgressBar.style.width = success ? '100%' : '100%';
          if (DOM.ghDeployProgressPercent) DOM.ghDeployProgressPercent.textContent = success ? '100%' : 'ERR';
          if (DOM.ghDeployProgressLabel) {
            DOM.ghDeployProgressLabel.textContent = success
              ? `✅ ${statusRes?.message || 'GitHub Pages deployment completed!'}`
              : `❌ ${statusRes?.error || statusRes?.message || 'GitHub Pages deployment encountered errors.'}`;
          }
          if (DOM.triggerDeployBtn) {
            DOM.triggerDeployBtn.disabled = false;
            DOM.triggerDeployBtn.innerHTML = '<span>🚀 Deploy to GitHub Pages</span>';
          }

          if (success) {
            showToast('GitHub Pages deployment completed successfully!', 'success');
          } else {
            showToast(statusRes?.error || 'GitHub Pages deployment encountered errors.', 'error');
          }
          refreshSystem();
        });

      } catch (err) {
        state.isDeploying = false;
        if (DOM.ghDeployProgressLabel) {
          DOM.ghDeployProgressLabel.textContent = `❌ ${err.message}`;
        }
        if (DOM.triggerDeployBtn) {
          DOM.triggerDeployBtn.disabled = false;
          DOM.triggerDeployBtn.innerHTML = '<span>🚀 Deploy to GitHub Pages</span>';
        }
        showToast(`Deploy error: ${err.message}`, 'error');
        appendTerminalLog(`[GITHUB ERROR] ${err.message}`, 'error');
      }
    });

    // Deploy Trigger: Cloudflare Workers
    if (DOM.triggerCfDeployBtn) {
      DOM.triggerCfDeployBtn.addEventListener('click', async () => {
        if (state.isDeploying) {
          showToast('Deployment is already in progress...', 'warning');
          return;
        }

        const dryRun = DOM.deployCfDryRun ? DOM.deployCfDryRun.checked : false;
        const workerName = document.getElementById('cfgCfProjectName')?.value?.trim() || state.activeProject || 'stylesdays';
        state.isDeploying = true;
        if (DOM.triggerCfDeployBtn) {
          DOM.triggerCfDeployBtn.disabled = true;
          DOM.triggerCfDeployBtn.innerHTML = '<span>⏳ Deploying to Edge...</span>';
        }
        if (DOM.deployProgressBarContainer) {
          DOM.deployProgressBarContainer.style.display = 'block';
          if (DOM.deployProgressBar) DOM.deployProgressBar.style.width = '10%';
          if (DOM.deployProgressPercent) DOM.deployProgressPercent.textContent = '10%';
          if (DOM.deployProgressLabel) DOM.deployProgressLabel.textContent = 'Initializing Cloudflare deployment...';
        }
        try {
          appendTerminalLog(`[CLOUDFLARE] Initiating Workers deployment (Worker Name=${workerName}, dry_run=${dryRun})...`, 'info');
          const currentTheme = (DOM.quickDeployThemeSelect && DOM.quickDeployThemeSelect.value) || (DOM.cfgTheme && DOM.cfgTheme.value) || undefined;
          const startRes = await api('/api/cloudflare/deploy', 'POST', {
            dry_run: dryRun,
            subdomain: workerName,
            worker_name: workerName,
            theme: currentTheme
          });

          if (startRes.message) {
            showToast(startRes.message, 'info');
          }

          if (state.deployPollInterval) clearInterval(state.deployPollInterval);
          state.deployPollInterval = setInterval(async () => {
            try {
              const statusRes = await api('/api/deploy/status');
              if (!statusRes) return;
              if (statusRes.logs && statusRes.logs.length) {
                renderTerminalLogs(statusRes.logs);
              }

              const pct = statusRes.percent || (statusRes.job && statusRes.job.percent) || 15;
              const msg = statusRes.message || (statusRes.job && statusRes.job.message) || 'Deploying...';
              if (DOM.deployProgressBar) {
                DOM.deployProgressBar.style.width = `${Math.min(98, Math.max(10, pct))}%`;
              }
              if (DOM.deployProgressPercent) {
                DOM.deployProgressPercent.textContent = `${pct}%`;
              }
              if (DOM.deployProgressLabel) {
                DOM.deployProgressLabel.textContent = msg;
              }

              if (statusRes.status === 'success') {
                clearInterval(state.deployPollInterval);
                state.deployPollInterval = null;
                state.isDeploying = false;
                if (DOM.deployProgressBar) DOM.deployProgressBar.style.width = '100%';
                if (DOM.deployProgressPercent) DOM.deployProgressPercent.textContent = '100%';
                if (DOM.deployProgressLabel) DOM.deployProgressLabel.textContent = '✅ Deployment & Live Edge Verified! (HTTP 200)';
                if (DOM.triggerCfDeployBtn) {
                  DOM.triggerCfDeployBtn.disabled = false;
                  DOM.triggerCfDeployBtn.innerHTML = '<span>🚀 Deploy to Cloudflare Edge</span>';
                }
                showToast('Cloudflare Workers deployment completed and live edge verified!', 'success');
                appendTerminalLog(`[CLOUDFLARE SUCCESS] Deployed to ${statusRes.live_url || 'edge'} in ${statusRes.duration || '0'}s`, 'success');
                await refreshSystem();
              } else if (statusRes.status === 'error' || statusRes.status === 'failed') {
                clearInterval(state.deployPollInterval);
                state.deployPollInterval = null;
                state.isDeploying = false;
                if (DOM.deployProgressLabel) DOM.deployProgressLabel.textContent = `❌ Deployment failed: ${statusRes.error || statusRes.message || 'Unknown error'}`;
                if (DOM.triggerCfDeployBtn) {
                  DOM.triggerCfDeployBtn.disabled = false;
                  DOM.triggerCfDeployBtn.innerHTML = '<span>🚀 Deploy to Cloudflare Edge</span>';
                }
                showToast(`Cloudflare deployment failed: ${statusRes.error || statusRes.message}`, 'error');
                appendTerminalLog(`[CLOUDFLARE ERROR] ${statusRes.error || statusRes.message}`, 'error');
              }
            } catch (pollErr) {
              console.warn('Error polling deploy status:', pollErr);
            }
          }, 800);
        } catch (err) {
          state.isDeploying = false;
          if (state.deployPollInterval) {
            clearInterval(state.deployPollInterval);
            state.deployPollInterval = null;
          }
          if (DOM.triggerCfDeployBtn) {
            DOM.triggerCfDeployBtn.disabled = false;
            DOM.triggerCfDeployBtn.innerHTML = '<span>🚀 Deploy to Cloudflare Edge</span>';
          }
          showToast(`Cloudflare Deploy error: ${err.message}`, 'error');
          appendTerminalLog(`[CLOUDFLARE ERROR] ${err.message}`, 'error');
        }
      });
    }

    // Clear Terminal Logs
    DOM.clearLogsBtn.addEventListener('click', () => {
      cachedTerminalLogs = ['[INFO] Terminal log cleared.'];
      DOM.terminalBody.innerHTML = '<div class="log-info">[INFO] Terminal log cleared.</div>';
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // =========================================================================
  // MULTI-USER AUTH GATE, SEPARATED SPACES & SYSTEM ADMIN CONSOLE
  // =========================================================================

  function setAuthFeedback(message, type = 'error') {
    if (!DOM.authFeedbackBox) return;
    if (!message) {
      DOM.authFeedbackBox.style.display = 'none';
      DOM.authFeedbackBox.textContent = '';
      DOM.authFeedbackBox.className = 'auth-feedback-box';
      return;
    }
    DOM.authFeedbackBox.textContent = message;
    DOM.authFeedbackBox.className = `auth-feedback-box ${type}`;
    DOM.authFeedbackBox.style.display = 'block';
  }

  function setAdminFeedback(message, type = 'info') {
    if (!DOM.adminConsoleFeedback) return;
    if (!message) {
      DOM.adminConsoleFeedback.style.display = 'none';
      DOM.adminConsoleFeedback.textContent = '';
      DOM.adminConsoleFeedback.className = 'auth-feedback-box';
      return;
    }
    DOM.adminConsoleFeedback.textContent = message;
    DOM.adminConsoleFeedback.className = `auth-feedback-box ${type}`;
    DOM.adminConsoleFeedback.style.display = 'block';
  }

  function switchAuthMode(mode) {
    setAuthFeedback('');
    if (DOM.authSetupAdminForm) DOM.authSetupAdminForm.style.display = mode === 'setup' ? 'flex' : 'none';
    if (DOM.authLoginForm) DOM.authLoginForm.style.display = mode === 'login' ? 'flex' : 'none';
    if (DOM.authRegisterForm) DOM.authRegisterForm.style.display = mode === 'register' ? 'flex' : 'none';

    if (DOM.authTabLoginBtn) {
      DOM.authTabLoginBtn.classList.toggle('active', mode === 'login');
      DOM.authTabLoginBtn.setAttribute('aria-selected', mode === 'login' ? 'true' : 'false');
    }
    if (DOM.authTabRegisterBtn) {
      DOM.authTabRegisterBtn.classList.toggle('active', mode === 'register');
      DOM.authTabRegisterBtn.setAttribute('aria-selected', mode === 'register' ? 'true' : 'false');
    }
  }

  function updateHeaderAuthControls() {
    const user = state.currentUser;
    if (!user) {
      if (DOM.currentUserBadge) DOM.currentUserBadge.style.display = 'none';
      if (DOM.btnOpenAdminConsole) DOM.btnOpenAdminConsole.style.display = 'none';
      if (DOM.btnSignOut) DOM.btnSignOut.style.display = 'none';
      if (DOM.adminSpaceBanner) DOM.adminSpaceBanner.style.display = 'none';
      return;
    }

    if (DOM.currentUserBadge) {
      DOM.currentUserBadge.style.display = 'inline-flex';
      DOM.currentUserBadge.title = `${user.display_name} (@${user.username}) · Space ${user.space_id}`;
    }
    if (DOM.currentUserRoleTag) {
      DOM.currentUserRoleTag.textContent = user.role === 'admin' ? 'ADMIN' : 'SPACE';
      DOM.currentUserRoleTag.classList.toggle('role-admin', user.role === 'admin');
    }
    if (DOM.currentUserNameLabel) {
      DOM.currentUserNameLabel.textContent = user.display_name || user.username;
    }
    if (DOM.btnOpenAdminConsole) {
      DOM.btnOpenAdminConsole.style.display = user.role === 'admin' ? 'inline-flex' : 'none';
    }
    if (DOM.btnSignOut) {
      DOM.btnSignOut.style.display = 'inline-flex';
    }

    const isInspectingOther =
      user.role === 'admin' &&
      state.activeSpaceId &&
      state.activeSpaceId !== user.space_id &&
      state.viewingSpaceOwner;

    if (DOM.adminSpaceBanner) {
      if (isInspectingOther) {
        DOM.adminSpaceBanner.style.display = 'block';
        if (DOM.adminViewingOwnerName) {
          DOM.adminViewingOwnerName.textContent = `${state.viewingSpaceOwner.display_name} (@${state.viewingSpaceOwner.username})`;
        }
        if (DOM.adminViewingSpaceId) {
          DOM.adminViewingSpaceId.textContent = state.activeSpaceId;
        }
      } else {
        DOM.adminSpaceBanner.style.display = 'none';
      }
    }
  }

  function clearSessionToAuthGate(reasonMessage = '') {
    state.authToken = '';
    state.currentUser = null;
    state.activeSpaceId = '';
    state.viewingSpaceOwner = null;
    state.projects = [];
    state.posts = [];
    state.allCategories = [];
    state.allCategoriesProject = null;
    state.selectedPostSlug = null;
    state.config = {};
    state.status = {};

    if (state.ingestPollInterval) {
      clearInterval(state.ingestPollInterval);
      state.ingestPollInterval = null;
    }
    if (state.deployPollInterval) {
      clearInterval(state.deployPollInterval);
      state.deployPollInterval = null;
    }
    state.isIngesting = false;
    state.isDeploying = false;

    closeAdminConsole();
    if (DOM.platformSettingsModal) DOM.platformSettingsModal.classList.remove('active');
    if (DOM.modalNewProject) DOM.modalNewProject.style.display = 'none';
    cachedTerminalLogs = ['[INFO] Signed out. Waiting for authentication.'];
    if (DOM.terminalBody) {
      DOM.terminalBody.innerHTML = '<div class="log-info">[INFO] Signed out. Waiting for authentication.</div>';
    }

    updateHeaderAuthControls();
    document.body.classList.add('auth-locked');
    if (DOM.authGateOverlay) DOM.authGateOverlay.style.display = 'flex';
    bootAuthGate(reasonMessage);
  }

  async function hydrateAuthenticatedWorkspace() {
    state.projects = [];
    state.posts = [];
    state.allCategories = [];
    state.allCategoriesProject = null;
    state.selectedPostSlug = null;
    if (DOM.previewIframe) DOM.previewIframe.srcdoc = '';
    if (DOM.diffResultsBox) DOM.diffResultsBox.style.display = 'none';
    if (DOM.scanResultBanner) DOM.scanResultBanner.style.display = 'none';
    const spaceLogLine = state.activeSpaceId
      ? `[SPACE] Connected to isolated workspace ${state.activeSpaceId}.`
      : '[INFO] Multi-Cloud Deployment Dashboard ready. Logs stream live.';
    cachedTerminalLogs = [spaceLogLine];
    if (DOM.terminalBody) {
      DOM.terminalBody.innerHTML = `<div class="log-info">${escapeHtml(spaceLogLine)}</div>`;
    }

    await loadProjects();
    await refreshSystem();
    if (typeof refreshStaticPages === 'function') {
      try {
        await refreshStaticPages();
      } catch (e) {}
    }
  }

  async function onAuthenticated(payload, welcomeMsg) {
    state.authToken = payload.token || '';
    state.currentUser = payload.user || null;
    state.activeSpaceId = payload.active_space_id || (payload.user ? payload.user.space_id : '');
    state.viewingSpaceOwner = null;
    if (payload.settings) {
      state.adminSettings = payload.settings;
    }

    // Wipe sensitive inputs from auth forms
    if (DOM.setupAdminPassword) DOM.setupAdminPassword.value = '';
    if (DOM.setupAdminConfirm) DOM.setupAdminConfirm.value = '';
    if (DOM.loginPassword) DOM.loginPassword.value = '';
    if (DOM.regPassword) DOM.regPassword.value = '';
    if (DOM.regConfirm) DOM.regConfirm.value = '';
    setAuthFeedback('');

    document.body.classList.remove('auth-locked');
    if (DOM.authGateOverlay) DOM.authGateOverlay.style.display = 'none';
    updateHeaderAuthControls();

    if (welcomeMsg) {
      showToast(welcomeMsg, 'success');
    }

    switchTab('tab-ingest');
    await hydrateAuthenticatedWorkspace();
  }

  async function bootAuthGate(initialNotice = '') {
    document.body.classList.add('auth-locked');
    if (DOM.authGateOverlay) DOM.authGateOverlay.style.display = 'flex';
    setAuthFeedback(initialNotice, initialNotice ? 'info' : 'error');

    try {
      const status = await api('/api/auth/status');
      state.authStatus = status;

      if (status.needs_admin_setup) {
        if (DOM.authModeTabs) DOM.authModeTabs.style.display = 'none';
        if (DOM.authSignupDisabledNote) DOM.authSignupDisabledNote.style.display = 'none';
        if (DOM.authGateSubtitle) {
          DOM.authGateSubtitle.textContent = 'First-run setup · Claim the System Admin account';
        }
        switchAuthMode('setup');
      } else {
        const allowSignup = status.allow_self_signup !== false;
        if (DOM.authModeTabs) DOM.authModeTabs.style.display = allowSignup ? 'grid' : 'none';
        if (DOM.authTabRegisterBtn) DOM.authTabRegisterBtn.style.display = allowSignup ? '' : 'none';
        if (DOM.authSignupDisabledNote) DOM.authSignupDisabledNote.style.display = allowSignup ? 'none' : 'block';
        if (DOM.authGateSubtitle) {
          DOM.authGateSubtitle.textContent = allowSignup
            ? 'Sign in or create a separated workspace space'
            : 'Sign in to your isolated workspace space';
        }
        switchAuthMode('login');
      }
      if (initialNotice) setAuthFeedback(initialNotice, 'info');
    } catch (err) {
      setAuthFeedback(`Unable to reach authentication server: ${err.message}`, 'error');
    }
  }

  function openAdminConsole() {
    if (!state.currentUser || state.currentUser.role !== 'admin') return;
    if (!DOM.adminConsoleModal) return;
    setAdminFeedback('');
    hideAdminInlinePanels();
    DOM.adminConsoleModal.classList.add('active');
    refreshAdminUsers();
  }

  function closeAdminConsole() {
    if (!DOM.adminConsoleModal) return;
    DOM.adminConsoleModal.classList.remove('active');
    hideAdminInlinePanels();
    setAdminFeedback('');
  }

  function hideAdminInlinePanels() {
    if (DOM.adminCreateUserForm) DOM.adminCreateUserForm.style.display = 'none';
    if (DOM.adminResetPasswordForm) DOM.adminResetPasswordForm.style.display = 'none';
    if (DOM.adminDeleteConfirmBar) DOM.adminDeleteConfirmBar.style.display = 'none';
  }

  async function refreshAdminUsers() {
    if (!state.currentUser || state.currentUser.role !== 'admin') return;
    try {
      const res = await api('/api/admin/users');
      state.adminUsers = Array.isArray(res.users) ? res.users : [];
      if (res.settings) state.adminSettings = res.settings;

      const totalUsers = state.adminUsers.length;
      const activeAdmins = state.adminUsers.filter((u) => u.role === 'admin' && u.status === 'active').length;
      if (DOM.adminMetricTotalUsers) DOM.adminMetricTotalUsers.textContent = String(totalUsers);
      if (DOM.adminMetricActiveAdmins) DOM.adminMetricActiveAdmins.textContent = String(activeAdmins);
      if (DOM.adminMetricTotalSpaces) DOM.adminMetricTotalSpaces.textContent = String(totalUsers);
      if (DOM.adminToggleSelfSignup) {
        DOM.adminToggleSelfSignup.checked = state.adminSettings.allow_self_signup !== false;
      }

      renderAdminUsersTable();
    } catch (err) {
      setAdminFeedback(`Failed to load users: ${err.message}`, 'error');
    }
  }

  function renderAdminUsersTable() {
    if (!DOM.adminUsersTableBody) return;
    DOM.adminUsersTableBody.innerHTML = '';

    if (!state.adminUsers.length) {
      DOM.adminUsersTableBody.innerHTML =
        '<tr><td colspan="6" style="text-align: center; padding: 1.5rem; color: #94A3B8;">No user accounts found.</td></tr>';
      return;
    }

    state.adminUsers.forEach((u) => {
      const isSelf = state.currentUser && u.id === state.currentUser.id;
      const isCurrentSpace = state.activeSpaceId === u.space_id;
      const stats = u.space_stats || { projects_count: 0, posts_count: 0, active_theme: '—' };
      const postsCount = stats.posts_count !== undefined ? stats.posts_count : (stats.total_posts || 0);
      const lastLogin = u.last_login_at ? u.last_login_at.slice(0, 16).replace('T', ' ') : 'Never';
      const roleBadge =
        u.role === 'admin'
          ? '<span class="user-role-tag role-admin">ADMIN</span>'
          : '<span class="user-role-tag">USER</span>';
      const statusBadge =
        u.status === 'active'
          ? '<span class="badge badge-synced">ACTIVE</span>'
          : '<span class="badge" style="background: rgba(239, 68, 68, 0.2); color: #FCA5A5; border: 1px solid rgba(239, 68, 68, 0.35);">SUSPENDED</span>';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div style="font-weight: 700; color: #F8FAFC;">${escapeHtml(u.display_name || u.username)} ${isSelf ? '<span style="font-size:0.65rem;color:#38BDF8;">(You)</span>' : ''}</div>
          <div style="font-size: 0.7rem; color: #94A3B8; font-family: var(--font-mono);">@${escapeHtml(u.username)} · ${escapeHtml(u.email)}</div>
        </td>
        <td>${roleBadge}</td>
        <td>${statusBadge}</td>
        <td>
          <div class="admin-space-meta">
            <div><code>${escapeHtml(u.space_id)}</code></div>
            <div>${stats.projects_count || 0} proj · ${postsCount} posts · ${escapeHtml(stats.active_theme || '—')}</div>
          </div>
        </td>
        <td style="font-size: 0.72rem; color: #94A3B8; white-space: nowrap;">${escapeHtml(lastLogin)}</td>
        <td>
          <div class="admin-row-actions">
            ${
              isCurrentSpace
                ? '<span class="badge badge-synced" style="font-size:0.66rem;">● Active Space</span>'
                : `<button type="button" class="btn btn-primary btn-xs admin-enter-space-btn" data-uid="${escapeHtml(u.id)}">🚀 Enter Space</button>`
            }
            ${
              !isSelf
                ? `<button type="button" class="btn btn-secondary btn-xs admin-role-btn" data-uid="${escapeHtml(u.id)}">${u.role === 'admin' ? 'Set User' : 'Make Admin'}</button>`
                : ''
            }
            ${
              !isSelf
                ? `<button type="button" class="btn btn-secondary btn-xs admin-status-btn" data-uid="${escapeHtml(u.id)}">${u.status === 'active' ? 'Suspend' : 'Activate'}</button>`
                : ''
            }
            <button type="button" class="btn btn-secondary btn-xs admin-reset-pw-btn" data-uid="${escapeHtml(u.id)}">🔑 Reset PW</button>
            ${
              !isSelf
                ? `<button type="button" class="btn btn-danger-outline btn-xs admin-delete-btn" data-uid="${escapeHtml(u.id)}">🗑️</button>`
                : ''
            }
          </div>
        </td>
      `;

      const enterBtn = tr.querySelector('.admin-enter-space-btn');
      if (enterBtn) {
        enterBtn.addEventListener('click', () => enterUserSpace(u));
      }

      const roleBtn = tr.querySelector('.admin-role-btn');
      if (roleBtn) {
        roleBtn.addEventListener('click', async () => {
          const nextRole = u.role === 'admin' ? 'user' : 'admin';
          try {
            await api(`/api/admin/users/${encodeURIComponent(u.id)}`, 'PATCH', { role: nextRole });
            setAdminFeedback(`Updated @${u.username} role to ${nextRole.toUpperCase()}.`, 'success');
            await refreshAdminUsers();
          } catch (err) {
            setAdminFeedback(err.message, 'error');
          }
        });
      }

      const statusBtn = tr.querySelector('.admin-status-btn');
      if (statusBtn) {
        statusBtn.addEventListener('click', async () => {
          const nextStatus = u.status === 'active' ? 'suspended' : 'active';
          try {
            await api(`/api/admin/users/${encodeURIComponent(u.id)}`, 'PATCH', { status: nextStatus });
            setAdminFeedback(
              nextStatus === 'suspended'
                ? `Suspended @${u.username} and revoked active sessions.`
                : `Reactivated @${u.username}.`,
              'success'
            );
            await refreshAdminUsers();
          } catch (err) {
            setAdminFeedback(err.message, 'error');
          }
        });
      }

      const resetBtn = tr.querySelector('.admin-reset-pw-btn');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          hideAdminInlinePanels();
          if (DOM.adminResetUserId) DOM.adminResetUserId.value = u.id;
          if (DOM.adminResetUserLabel) DOM.adminResetUserLabel.textContent = `${u.display_name} (@${u.username})`;
          if (DOM.adminResetNewPassword) DOM.adminResetNewPassword.value = '';
          if (DOM.adminResetPasswordForm) DOM.adminResetPasswordForm.style.display = 'block';
          if (DOM.adminResetNewPassword) DOM.adminResetNewPassword.focus();
        });
      }

      const deleteBtn = tr.querySelector('.admin-delete-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
          hideAdminInlinePanels();
          if (DOM.adminDeleteUserId) DOM.adminDeleteUserId.value = u.id;
          if (DOM.adminDeleteUserLabel) DOM.adminDeleteUserLabel.textContent = `${u.display_name} (@${u.username})`;
          if (DOM.adminDeleteConfirmBar) DOM.adminDeleteConfirmBar.style.display = 'block';
        });
      }

      DOM.adminUsersTableBody.appendChild(tr);
    });
  }

  async function enterUserSpace(targetUser) {
    if (!state.currentUser || state.currentUser.role !== 'admin') return;
    state.activeSpaceId = targetUser.space_id;
    state.viewingSpaceOwner = targetUser.space_id === state.currentUser.space_id ? null : targetUser;
    updateHeaderAuthControls();
    closeAdminConsole();
    showToast(
      state.viewingSpaceOwner
        ? `Entered separated space of ${targetUser.display_name} (@${targetUser.username})`
        : 'Returned to your own System Admin space',
      'info'
    );
    await hydrateAuthenticatedWorkspace();
  }

  async function returnToOwnSpace() {
    if (!state.currentUser) return;
    state.activeSpaceId = state.currentUser.space_id;
    state.viewingSpaceOwner = null;
    updateHeaderAuthControls();
    showToast('Returned to your own workspace space.', 'info');
    await hydrateAuthenticatedWorkspace();
  }

  function initAuthAndAdminUI() {
    if (DOM.authTabLoginBtn) {
      DOM.authTabLoginBtn.addEventListener('click', () => switchAuthMode('login'));
    }
    if (DOM.authTabRegisterBtn) {
      DOM.authTabRegisterBtn.addEventListener('click', () => switchAuthMode('register'));
    }

    // First-Run System Admin Setup Form
    if (DOM.authSetupAdminForm) {
      DOM.authSetupAdminForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        setAuthFeedback('');
        const username = DOM.setupAdminUsername ? DOM.setupAdminUsername.value.trim() : '';
        const display_name = DOM.setupAdminDisplayName ? DOM.setupAdminDisplayName.value.trim() : '';
        const email = DOM.setupAdminEmail ? DOM.setupAdminEmail.value.trim() : '';
        const password = DOM.setupAdminPassword ? DOM.setupAdminPassword.value : '';
        const confirm = DOM.setupAdminConfirm ? DOM.setupAdminConfirm.value : '';

        if (password !== confirm) {
          setAuthFeedback('Passwords do not match.', 'error');
          return;
        }
        if (DOM.btnSubmitSetupAdmin) DOM.btnSubmitSetupAdmin.disabled = true;
        try {
          const res = await api('/api/auth/setup-admin', 'POST', { username, display_name, email, password });
          await onAuthenticated(res, `System Admin @${res.user.username} initialized with isolated space.`);
        } catch (err) {
          setAuthFeedback(err.message, 'error');
        } finally {
          if (DOM.btnSubmitSetupAdmin) DOM.btnSubmitSetupAdmin.disabled = false;
        }
      });
    }

    // Sign In Form
    if (DOM.authLoginForm) {
      DOM.authLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        setAuthFeedback('');
        const identifier = DOM.loginIdentifier ? DOM.loginIdentifier.value.trim() : '';
        const password = DOM.loginPassword ? DOM.loginPassword.value : '';
        if (DOM.btnSubmitLogin) DOM.btnSubmitLogin.disabled = true;
        try {
          const res = await api('/api/auth/login', 'POST', { identifier, password });
          await onAuthenticated(res, `Welcome back, ${res.user.display_name || res.user.username}!`);
        } catch (err) {
          setAuthFeedback(err.message, 'error');
        } finally {
          if (DOM.btnSubmitLogin) DOM.btnSubmitLogin.disabled = false;
        }
      });
    }

    // Self-Registration Form (Creates User + Separated Space)
    if (DOM.authRegisterForm) {
      DOM.authRegisterForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        setAuthFeedback('');
        const username = DOM.regUsername ? DOM.regUsername.value.trim() : '';
        const display_name = DOM.regDisplayName ? DOM.regDisplayName.value.trim() : '';
        const email = DOM.regEmail ? DOM.regEmail.value.trim() : '';
        const password = DOM.regPassword ? DOM.regPassword.value : '';
        const confirm = DOM.regConfirm ? DOM.regConfirm.value : '';

        if (password !== confirm) {
          setAuthFeedback('Passwords do not match.', 'error');
          return;
        }
        if (DOM.btnSubmitRegister) DOM.btnSubmitRegister.disabled = true;
        try {
          const res = await api('/api/auth/register', 'POST', { username, display_name, email, password });
          await onAuthenticated(res, `Separated space created for @${res.user.username}!`);
        } catch (err) {
          setAuthFeedback(err.message, 'error');
        } finally {
          if (DOM.btnSubmitRegister) DOM.btnSubmitRegister.disabled = false;
        }
      });
    }

    // Sign Out
    if (DOM.btnSignOut) {
      DOM.btnSignOut.addEventListener('click', async () => {
        try {
          if (state.authToken) {
            await api('/api/auth/logout', 'POST');
          }
        } catch (e) {}
        clearSessionToAuthGate('You have been signed out cleanly.');
      });
    }

    // Admin Console Modal Controls
    if (DOM.btnOpenAdminConsole) {
      DOM.btnOpenAdminConsole.addEventListener('click', openAdminConsole);
    }
    if (DOM.btnOpenAdminFromBanner) {
      DOM.btnOpenAdminFromBanner.addEventListener('click', openAdminConsole);
    }
    if (DOM.btnReturnOwnSpace) {
      DOM.btnReturnOwnSpace.addEventListener('click', returnToOwnSpace);
    }
    if (DOM.btnCloseAdminConsole) {
      DOM.btnCloseAdminConsole.addEventListener('click', closeAdminConsole);
    }
    if (DOM.adminConsoleModal) {
      DOM.adminConsoleModal.addEventListener('click', (e) => {
        if (e.target === DOM.adminConsoleModal) closeAdminConsole();
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && DOM.adminConsoleModal && DOM.adminConsoleModal.classList.contains('active')) {
        closeAdminConsole();
      }
    });

    if (DOM.btnAdminRefreshUsers) {
      DOM.btnAdminRefreshUsers.addEventListener('click', refreshAdminUsers);
    }

    // Toggle Public Self-Signup
    if (DOM.adminToggleSelfSignup) {
      DOM.adminToggleSelfSignup.addEventListener('change', async () => {
        const allow = Boolean(DOM.adminToggleSelfSignup.checked);
        try {
          const res = await api('/api/admin/settings', 'PATCH', { allow_self_signup: allow });
          state.adminSettings = res.settings || { allow_self_signup: allow };
          setAdminFeedback(
            allow
              ? 'Public self-signup enabled: new users can register their own separated space.'
              : 'Public self-signup disabled: only System Admins can provision new spaces.',
            'success'
          );
        } catch (err) {
          DOM.adminToggleSelfSignup.checked = !allow;
          setAdminFeedback(err.message, 'error');
        }
      });
    }

    // Provision New User Form
    if (DOM.btnToggleAdminCreateForm) {
      DOM.btnToggleAdminCreateForm.addEventListener('click', () => {
        const isOpen = DOM.adminCreateUserForm && DOM.adminCreateUserForm.style.display === 'block';
        hideAdminInlinePanels();
        if (!isOpen && DOM.adminCreateUserForm) {
          DOM.adminCreateUserForm.reset();
          DOM.adminCreateUserForm.style.display = 'block';
          if (DOM.adminNewUsername) DOM.adminNewUsername.focus();
        }
      });
    }
    if (DOM.btnCancelAdminCreate) {
      DOM.btnCancelAdminCreate.addEventListener('click', hideAdminInlinePanels);
    }
    if (DOM.adminCreateUserForm) {
      DOM.adminCreateUserForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        setAdminFeedback('');
        const payload = {
          username: DOM.adminNewUsername ? DOM.adminNewUsername.value.trim() : '',
          email: DOM.adminNewEmail ? DOM.adminNewEmail.value.trim() : '',
          display_name: DOM.adminNewDisplayName ? DOM.adminNewDisplayName.value.trim() : '',
          password: DOM.adminNewPassword ? DOM.adminNewPassword.value : '',
          role: DOM.adminNewRole ? DOM.adminNewRole.value : 'user',
        };
        if (DOM.btnSubmitAdminCreate) DOM.btnSubmitAdminCreate.disabled = true;
        try {
          const res = await api('/api/admin/users', 'POST', payload);
          DOM.adminCreateUserForm.reset();
          hideAdminInlinePanels();
          setAdminFeedback(`Created user @${res.user.username} with separated space ${res.user.space_id}.`, 'success');
          await refreshAdminUsers();
        } catch (err) {
          setAdminFeedback(err.message, 'error');
        } finally {
          if (DOM.btnSubmitAdminCreate) DOM.btnSubmitAdminCreate.disabled = false;
        }
      });
    }

    // Reset Password Inline Form
    if (DOM.btnCancelAdminReset) {
      DOM.btnCancelAdminReset.addEventListener('click', hideAdminInlinePanels);
    }
    if (DOM.adminResetPasswordForm) {
      DOM.adminResetPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const uid = DOM.adminResetUserId ? DOM.adminResetUserId.value : '';
        const newPw = DOM.adminResetNewPassword ? DOM.adminResetNewPassword.value : '';
        if (!uid) return;
        try {
          await api(`/api/admin/users/${encodeURIComponent(uid)}`, 'PATCH', { password: newPw });
          hideAdminInlinePanels();
          setAdminFeedback('Password updated and previous sessions revoked.', 'success');
          await refreshAdminUsers();
        } catch (err) {
          setAdminFeedback(err.message, 'error');
        }
      });
    }

    // Delete User & Purge Space Inline Confirmation
    if (DOM.btnCancelAdminDelete) {
      DOM.btnCancelAdminDelete.addEventListener('click', hideAdminInlinePanels);
    }
    if (DOM.btnConfirmAdminDelete) {
      DOM.btnConfirmAdminDelete.addEventListener('click', async () => {
        const uid = DOM.adminDeleteUserId ? DOM.adminDeleteUserId.value : '';
        if (!uid) return;
        try {
          const target = state.adminUsers.find((u) => u.id === uid);
          const wasViewingTarget = target && state.activeSpaceId === target.space_id;
          await api(`/api/admin/users/${encodeURIComponent(uid)}`, 'DELETE', { purge_space: true });
          hideAdminInlinePanels();
          setAdminFeedback('User account deleted and separated workspace purged.', 'success');
          if (wasViewingTarget) {
            await returnToOwnSpace();
          }
          await refreshAdminUsers();
        } catch (err) {
          setAdminFeedback(err.message, 'error');
        }
      });
    }
  }

  // Initialize Application
  window.addEventListener('DOMContentLoaded', () => {
    initPlatformDivision();
    setActivePlatformView('cf');
    switchTab('tab-ingest');
    initListeners();
    if (window.LogoCropperStudio && !window.cropperStudioInstance) {
      window.cropperStudioInstance = new window.LogoCropperStudio();
    }
    initModelSwitcher();
    initProjectSystem();
    initAuthAndAdminUI();
    bootAuthGate();
  });

})();
