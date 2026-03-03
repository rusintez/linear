const LINEAR_ENDPOINT = "https://api.linear.app/graphql";

export interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{
    message: string;
    path?: string[];
    extensions?: Record<string, unknown>;
  }>;
}

export async function graphql<T = unknown>(
  apiKey: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<GraphQLResponse<T>> {
  const body: Record<string, unknown> = { query };
  if (variables && Object.keys(variables).length > 0) {
    body.variables = variables;
  }

  const response = await fetch(LINEAR_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return response.json();
}

// Common queries for convenience
export const QUERIES = {
  viewer: `query { viewer { id name email } }`,

  teams: `query { teams { nodes { id name key } } }`,

  // Issues without filter (all issues)
  issuesAll: `query Issues($first: Int = 50) {
    issues(first: $first, orderBy: updatedAt) {
      nodes { id identifier title state { name } assignee { name } priority createdAt }
    }
  }`,

  // Issues with team filter
  issuesByTeam: `query IssuesByTeam($teamId: ID!, $first: Int = 50) {
    issues(filter: { team: { id: { eq: $teamId } } }, first: $first, orderBy: updatedAt) {
      nodes { id identifier title state { name } assignee { name } priority createdAt }
    }
  }`,

  // Issues assigned to user
  issuesByAssignee: `query IssuesByAssignee($assigneeId: ID!, $first: Int = 50) {
    issues(filter: { assignee: { id: { eq: $assigneeId } } }, first: $first, orderBy: updatedAt) {
      nodes { id identifier title state { name } assignee { name } priority createdAt }
    }
  }`,

  // Issues assigned to current user (viewer)
  myIssues: `query MyIssues($first: Int = 50) {
    viewer {
      assignedIssues(first: $first, orderBy: updatedAt) {
        nodes { id identifier title state { name } priority createdAt project { name } }
      }
    }
  }`,

  issue: `query Issue($id: String!) {
    issue(id: $id) {
      id identifier title description
      state { id name }
      assignee { id name }
      priority estimate
      labels { nodes { id name } }
      createdAt updatedAt
    }
  }`,

  projects: `query { projects { nodes { id name state } } }`,

  project: `query Project($id: String!) {
    project(id: $id) {
      id
      name
      description
      state
      progress
      url
      targetDate
      startDate
      lead { name }
      members { nodes { name } }
      teams { nodes { name } }
      externalLinks { nodes { label url } }
      projectMilestones { nodes { id name description targetDate status progress } }
    }
  }`,

  projectWithContent: `query ProjectWithContent($id: String!) {
    project(id: $id) {
      id
      name
      description
      content
      state
      progress
      url
      targetDate
      startDate
      lead { name }
      members { nodes { name } }
      teams { nodes { name } }
      externalLinks { nodes { label url } }
      projectMilestones { nodes { id name description targetDate status progress } }
    }
  }`,

  // Milestones - note: filter requires inline variable substitution
  milestones: `query Milestones {
    projectMilestones {
      nodes {
        id
        name
        description
        targetDate
        status
        progress
        project { id name }
      }
    }
  }`,

  milestone: `query Milestone($id: String!) {
    projectMilestone(id: $id) {
      id
      name
      description
      targetDate
      status
      progress
      project { id name }
      issues { nodes { identifier title state { name } } }
    }
  }`,

  users: `query { users { nodes { id name email active } } }`,

  // Workflow states without filter
  workflowStatesAll: `query { workflowStates { nodes { id name type team { id name } } } }`,

  // Workflow states with team filter
  workflowStatesByTeam: `query WorkflowStatesByTeam($teamId: ID!) {
    workflowStates(filter: { team: { id: { eq: $teamId } } }) {
      nodes { id name type team { id name } }
    }
  }`,

  labels: `query { issueLabels { nodes { id name color } } }`,

  // Cycles without filter
  cyclesAll: `query { cycles { nodes { id number name startsAt endsAt team { name } } } }`,

  // Cycles with team filter
  cyclesByTeam: `query CyclesByTeam($teamId: ID!) {
    cycles(filter: { team: { id: { eq: $teamId } } }) {
      nodes { id number name startsAt endsAt }
    }
  }`,

  // Search using title/description filter (searchIssues is deprecated)
  search: `query Search($query: String!, $first: Int = 25) {
    issues(filter: { or: [
      { title: { containsIgnoreCase: $query } },
      { description: { containsIgnoreCase: $query } }
    ]}, first: $first) {
      nodes { id identifier title state { name } }
    }
  }`,

  // Inbox / Notifications
  inbox: `query Inbox($first: Int = 50) {
    notifications(first: $first, orderBy: createdAt) {
      nodes {
        id
        type
        createdAt
        readAt
        snoozedUntilAt
        ... on IssueNotification {
          issue { identifier title }
          comment { body }
        }
        ... on ProjectNotification {
          project { name }
        }
      }
    }
  }`,

  inboxUnread: `query InboxUnread {
    notificationsUnreadCount
  }`,
};

// Common mutations
export const MUTATIONS = {
  createIssue: `mutation CreateIssue($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue { id identifier title }
    }
  }`,

  updateIssue: `mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
    issueUpdate(id: $id, input: $input) {
      success
      issue { id identifier title state { name } }
    }
  }`,

  createComment: `mutation CreateComment($issueId: String!, $body: String!) {
    commentCreate(input: { issueId: $issueId, body: $body }) {
      success
      comment { id body }
    }
  }`,

  // Inbox mutations
  markNotificationRead: `mutation MarkRead($id: String!) {
    notificationUpdate(id: $id, input: { readAt: "${new Date().toISOString()}" }) {
      success
    }
  }`,

  markAllRead: `mutation MarkAllRead {
    notificationMarkReadAll(input: {}) {
      success
    }
  }`,

  snoozeNotification: `mutation Snooze($id: String!, $until: DateTime!) {
    notificationUpdate(id: $id, input: { snoozedUntilAt: $until }) {
      success
    }
  }`,

  unsnoozeNotification: `mutation Unsnooze($id: String!) {
    notificationUpdate(id: $id, input: { snoozedUntilAt: null }) {
      success
    }
  }`,

  archiveNotification: `mutation Archive($id: String!) {
    notificationArchive(id: $id) {
      success
    }
  }`,
};
