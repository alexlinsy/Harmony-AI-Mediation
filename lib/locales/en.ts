export const translations: Record<string, string> = {
  // Common
  'common.cancel': 'Cancel',
  'common.ok': 'OK',
  'common.error': 'Error',
  'common.loading': 'Loading...',
  'common.goBack': 'Go Back',

  // Tab labels
  'tabs.groups': 'Groups',
  'tabs.mediator': 'Mediator',
  'tabs.insights': 'Insights',
  'tabs.sanctuary': 'Sanctuary',

  // Groups screen
  'groups.title': 'Your Groups',
  'groups.subtitle': 'Select a space to begin mediation.',
  'groups.createGroup': '+ Create Group',
  'groups.joinGroup': 'Join Group',
  'groups.createTitle': 'Create a Safe Space',
  'groups.placeholderGroupName': 'Group Name (e.g., Family)',
  'groups.placeholderInviteCode': '6-Digit Invite Code',
  'groups.inviteCodeLabel': 'Invite Code: {code}',
  'groups.deleteGroup': 'Delete Group',
  'groups.leaveGroup': 'Leave Group',
  'groups.deleteConfirm':
    'Are you sure you want to permanently delete "{name}" and all its data?',
  'groups.leaveConfirm': 'Are you sure you want to leave "{name}"?',
  'groups.enterGroupName': 'Enter a group name',
  'groups.enterInviteCode': 'Enter an invite code',
  'groups.groupCreated': 'Group Created!',
  'groups.inviteCodeMessage': 'Your invite code is: {code}',
  'groups.invalidCode': 'Invalid invite code or group not found.',
  'groups.alreadyInGroup': 'You are already in this group.',
  'groups.joinedSuccess': 'You have joined the group!',
  'groups.delete': 'Delete',
  'groups.leave': 'Leave',
  'groups.emptyState': "You haven't joined any groups yet.",

  // Chat (index.tsx - Mediator tab)
  'chat.noGroupTitle': 'No Group Selected',
  'chat.noGroupAction': 'Go to Groups',
  'chat.sessionSubtitle': 'Therapy Session',
  'chat.breathe': 'Breathe',
  'chat.mediation': 'Mediation',
  'chat.typing': 'Harmony is typing...',
  'chat.submitReady': "I'm ready for Group Mediation",
  'chat.placeholder': 'Share your feelings...',
  'chat.waitingConfirm': 'Waiting for others to confirm resolution...',
  'chat.confirmResolution': 'Confirm Resolution',
  'chat.inputDisabled':
    'Input disabled. Waiting for others to complete their sessions.',
  'chat.partnerSubmitted': 'Partner Submitted',
  'chat.partnerSubmittedMsg':
    'Your partner has shared their feelings. Please talk to Harmony and submit your side when ready.',
  'chat.partnerWaiting': 'Partner is waiting',
  'chat.partnerWaitingMsg':
    'Your partner is waiting for you to share your side of the story. Please talk to Harmony and submit when ready.',
  'chat.sessionUnavailable': 'Session Unavailable',
  'chat.sessionRetry':
    'Could not set up the mediation session. Please check your connection and try again.',
  'chat.sessionBusy':
    'The mediation session is still being set up. Please wait a moment.',
  'chat.aiInitializing': 'The AI is still initializing. Please wait a moment.',
  'chat.notReady': 'Not Ready',
  'chat.needMoreFeelings':
    'Please share more about your feelings before submitting.',
  'chat.nudgeSent': 'Nudge Sent',
  'chat.nudgeSentMsg':
    "Your partner has been notified. You'll be taken to mediation once they've shared their side.",
  'chat.harmonyRestored': 'Harmony Restored',
  'chat.peacePoints': '+10 Peace Points!',
  'chat.errorGeneric':
    "I'm sorry, I encountered an issue processing that. Please take a deep breath and try again.",
  'chat.summaryError': 'Failed to save your summary. Please try again.',
  'chat.summaryGenericError':
    'Something went wrong while generating the summary. Please try again.',
  'chat.cooldownTitle': "Let's Pause for a Moment",
  'chat.cooldownBody':
    "I can sense you're feeling very overwhelmed right now. That's completely okay. Before we continue, let's take a few deep breaths together to help calm your mind and body.",
  'chat.cooldownButton': 'Start Breathing Exercise',
  'chat.cooldownContinue': "I'm okay, continue",
  'chat.audioError': 'Could not process audio. Please try again.',

  // Mediation Result screen
  'mediation.loadingText':
    'The Master Mediator is reviewing your hearts...',
  'mediation.waitingTitle': 'Mediation in Progress',
  'mediation.waitingBody':
    'Your partner is currently generating the mediation result. The Master Mediator is reviewing both sides with care and wisdom.',
  'mediation.waitingHint':
    'This usually takes a few moments. The results will appear automatically.',
  'mediation.resultTitle': 'Mediation Result',
  'mediation.showOriginal': 'Show Original',
  'mediation.translateTo': 'Translate to {language}',
  'mediation.translating': 'Translating...',
  'mediation.actionMemo': 'Action Memo',
  'mediation.returnPeace': 'Return with Peace',
  'mediation.continue': 'Continue',
  'mediation.endMediation': 'The End',
  'mediation.stepOf': 'Step {current} of {total}',
  'mediation.previous': 'Previous',
  'mediation.stillWaiting': 'Still Waiting',
  'mediation.stillWaitingBody':
    'The mediation is taking longer than expected. You can check back shortly.',
  'mediation.noActiveSession': 'No Session',
  'mediation.noActiveSessionBody':
    'There is no active mediation session. Please go back and start a new session.',
  'mediation.waitingForParties': 'Waiting',
  'mediation.waitingForPartiesBody':
    'The AI is waiting for all parties to submit their feelings.',
  'mediation.errorOverwhelmed':
    'The Master Mediator is currently overwhelmed. Please try again in a moment.',
  'mediation.translationError': 'Translation Error',
  'mediation.readyTitle': 'Mediation Ready',
  'mediation.readyBody':
    'All parties have submitted. The Master Mediator is ready to begin.',
  'mediation.completedTitle': 'Mediation Complete',
  'mediation.completedBody':
    'The Master Mediator has reached a resolution. View the results now.',
  'mediation.startedTitle': 'Mediation Started',
  'mediation.startedBody':
    'Your partner has started the mediation. Go watch the results unfold.',

  // Profile screen
  'profile.sanctuaryTitle': 'My Sanctuary',
  'profile.defaultName': 'Guardian',
  'profile.groupsCount': '{count} Groups Joined & Created',
  'profile.progression': 'Progression',
  'profile.peacePoints': 'Peace Points',
  'profile.preferredLanguage': 'Preferred Language',
  'profile.archives': 'Archives',
  'profile.insights': 'Insights',
  'profile.recentMeditations': 'Recent Meditations',
  'profile.noMeditations': 'No completed mediations yet.',
  'profile.logout': 'Log Out',
  'profile.updateNameError': 'Could not update name.',
  'profile.updateLangError': 'Could not update language preference.',
  'profile.rank.zenMaster': 'Zen Master',
  'profile.rank.zenMasterSub': 'Peaceful Arbiter',
  'profile.rank.stillWater': 'Still Water',
  'profile.rank.stillWaterSub': 'Calm Mediator',
  'profile.rank.seedling': 'Seedling',
  'profile.rank.seedlingSub': 'Growing Harmony',
  'profile.language.en': 'English',
  'profile.language.zh-Hant': 'Traditional Chinese',
  'profile.language.zh-Hans': 'Simplified Chinese',

  // Explore / Insights screen
  'explore.title': 'Insights Heatmap',
  'explore.subtitle': 'Understanding your conflict patterns.',
  'explore.category.Emotional': 'Emotional',
  'explore.category.Communication': 'Communication',
  'explore.category.Household': 'Household',
  'explore.category.Financial': 'Financial',
  'explore.category.Other': 'Other',
  'explore.noData':
    'The Insights feature will be available once enough mediation data is collected to gently form a heatmap of your interactions.',
  'explore.triggersTitle': 'Triggers Analysis',
  'explore.triggersSubtitle': 'What sparks your conflicts',
  'explore.noDataTriggers': 'More sessions needed for trigger analysis',
  'explore.patternsTitle': 'Conflict Patterns',
  'explore.patternsSubtitle': 'When conflicts tend to arise',
  'explore.patternsInsight': 'Sunday evenings are your peak time. A pre-emptive breathing exercise may help.',
  'explore.noDataPatterns': 'Complete more sessions to reveal your patterns',
  'explore.harmonyTitle': 'Harmony Index',
  'explore.harmonySubtitle': 'Your growth over time',
  'explore.harmonyGrowth': 'Your harmony has grown {percent}% over the last 6 months',
  'explore.days.sun': 'Sun',
  'explore.days.mon': 'Mon',
  'explore.days.tue': 'Tue',
  'explore.days.wed': 'Wed',
  'explore.days.thu': 'Thu',
  'explore.days.fri': 'Fri',
  'explore.days.sat': 'Sat',

  // Archives index
  'archives.title': 'The Archives',
  'archives.backToSanctuary': 'Sanctuary',
  'archives.empty':
    'Your archives are currently empty. Complete a mediation to see it here.',
  'archives.unknownGroup': 'Unknown Group',
  'archives.conflict': 'Conflict',

  // Archive detail
  'archiveDetail.backToArchives': 'Archives',
  'archiveDetail.arbitrationResult': 'Arbitration Result',
  'archiveDetail.actionMemo': 'Action Memo',
  'archiveDetail.notFound': 'Record not found.',

  // Breathe screen
  'breathe.title': 'Harmony Meditation',
  'breathe.subtitle': 'Follow the circle to regulate your breathing.',
  'breathe.phaseInhale': 'Breathe In',
  'breathe.phaseHold': 'Hold',
  'breathe.phaseExhale': 'Breathe Out',
  'breathe.phaseInhaleShort': 'Inhale',
  'breathe.phaseHoldShort': 'Hold',
  'breathe.phaseExhaleShort': 'Exhale',
  'breathe.endSession': 'End Session',

  // Voice Chat UI
  'voiceChat.listening': 'Listening... Tap to send',
  'voiceChat.tapToSpeak': 'Tap the microphone to speak',

  // Language labels (native script)
  'language.en': 'English',
  'language.zh-Hant': '繁體中文',
  'language.zh-Hans': '简体中文',
};

export default translations;
