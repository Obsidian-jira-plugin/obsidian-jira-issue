const JIRA_ICON_BASE_URL = 'https://bitbucket.org/atlassian/atlassian-frontend-mirror/raw/d01ccea001254920f3c2f0e0473aa09802acaaba/design-system/'
export const JIRA_ISSUE_ICON_SVG_BASE_URL = JIRA_ICON_BASE_URL + 'icon-object/svgs_raw/'
export const JIRA_PRIORITY_ICON_SVG_BASE_URL = JIRA_ICON_BASE_URL + 'icon/icons_raw/core/'

export function generateJiraIssueTypeSvgURL(issue_type: string): string {
    return JIRA_ISSUE_ICON_SVG_BASE_URL + issue_type + "/16.svg"
}

export function generateJiraIssuePrioritySvgURL(priority: string): string {
    return JIRA_PRIORITY_ICON_SVG_BASE_URL + "priority-" + priority + ".svg"
}

export const JIRA_ISSUE_TYPE_ICON_MAP: Record<string, string> = {
    'bug': generateJiraIssueTypeSvgURL('bug'),
    'epic': generateJiraIssueTypeSvgURL('epic'),
    'improvement': generateJiraIssueTypeSvgURL('improvement'),
    'incident': generateJiraIssueTypeSvgURL('incident'),
    'issue': generateJiraIssueTypeSvgURL('issue'),
    'problem': generateJiraIssueTypeSvgURL('problem'),
    'question': generateJiraIssueTypeSvgURL('question'),
    'story': generateJiraIssueTypeSvgURL('story'),
    'subtask': generateJiraIssueTypeSvgURL('subtask'),
    'task': generateJiraIssueTypeSvgURL('task'),
}

export const JIRA_PRIORITY_ICON_MAP: Record<string, string> = {
    'blocker': generateJiraIssuePrioritySvgURL('blocker'),
    'critical': generateJiraIssuePrioritySvgURL('critical'),
    'high': generateJiraIssuePrioritySvgURL('high'),
    'highest': generateJiraIssuePrioritySvgURL('highest'),
    'low': generateJiraIssuePrioritySvgURL('low'),
    'lowest': generateJiraIssuePrioritySvgURL('lowest'),
    'major': generateJiraIssuePrioritySvgURL('major'),
    'medium': generateJiraIssuePrioritySvgURL('medium'),
    'minor': generateJiraIssuePrioritySvgURL('minor'),
    'trivial': generateJiraIssuePrioritySvgURL('trivial'),
}

export const JIRA_DEFAULT_ISSUE_ICON = JIRA_ISSUE_TYPE_ICON_MAP["issue"]
export const JIRA_DEFAULT_PRIORITY_ICON = JIRA_PRIORITY_ICON_SVG_BASE_URL + "question-circle.svg"
