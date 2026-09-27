import * as vscode from 'vscode';
import { RequestContext, RequestItem, SidebarNodeKind } from '../../types';

const METHOD_COLORS: Record<string, string> = {
  GET: 'charts.blue',
  POST: 'charts.green',
  PUT: 'charts.orange',
  PATCH: 'charts.orange',
  DELETE: 'charts.red',
};

export function getProfileIcon(color?: string, isActive?: boolean): vscode.Uri {
  const hex = color || '#3b82f6';
  const check = isActive
    ? `<path d="M4.5 8 L7 10.5 L11.5 5" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
    : '';
  const stroke = isActive ? `stroke="#ffffff" stroke-width="1.5"` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="${hex}" ${stroke}/>${check}</svg>`;
  if (vscode.Uri && typeof vscode.Uri.parse === 'function') {
    return vscode.Uri.parse(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
  }
  return { scheme: 'data', path: svg, toString: () => svg } as any;
}

export class BlueByrdTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly kind: SidebarNodeKind,
    public readonly itemId?: string,
    public readonly parentId?: string,
    public readonly requestContext?: RequestContext,
    public children: BlueByrdTreeItem[] = [],
    command?: vscode.Command,
    customDescription?: string,
    defaultCollapsibleState?: vscode.TreeItemCollapsibleState
  ) {
    const isExpandable =
      kind === 'section' ||
      kind === 'profile' ||
      kind === 'collection' ||
      kind === 'folder' ||
      (kind === 'environment' && children.length > 0);

    super(
      label,
      defaultCollapsibleState !== undefined
        ? defaultCollapsibleState
        : isExpandable
        ? (kind === 'section' || (kind === 'environment' && children.length > 0)
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed)
        : vscode.TreeItemCollapsibleState.None
    );

    this.id = itemId ? `${kind}-${itemId}` : undefined;
    this.command = command;
    this.contextValue = `byrdsnest.${kind}`;

    if (customDescription !== undefined) {
      this.description = customDescription;
    }

    if (kind === 'active-filter') {
      this.iconPath = new vscode.ThemeIcon('filter');
      this.contextValue = 'byrdsnest.activeFilter';
      if (customDescription === undefined) {
        this.description = '(click to switch)';
      }
      this.tooltip = `Active Profile Scope: ${label}\nClick to switch profile scope.`;
    } else if (kind === 'section') {
      this.collapsibleState = defaultCollapsibleState ?? vscode.TreeItemCollapsibleState.Expanded;
      if (label === 'Profiles') {
        this.iconPath = new vscode.ThemeIcon('account');
        this.contextValue = 'byrdsnest.section.profiles';
      } else if (label === 'Environments') {
        this.iconPath = new vscode.ThemeIcon('server-environment');
        this.contextValue = 'byrdsnest.section.environments';
      } else if (label === 'Collections') {
        this.iconPath = new vscode.ThemeIcon('library');
        this.contextValue = 'byrdsnest.section.collections';
      } else if (label === 'History') {
        this.iconPath = new vscode.ThemeIcon('history');
        this.contextValue = 'byrdsnest.section.history';
      }
    } else if (kind === 'profile') {
      this.iconPath = itemId === 'global' ? new vscode.ThemeIcon('globe') : getProfileIcon(undefined, false);
      this.contextValue = itemId === 'global' ? 'byrdsnest.profile.global' : 'byrdsnest.profile';
      if (customDescription === undefined) {
        this.description = 'profile';
      }
      this.tooltip = `Profile: ${label}`;
    } else if (kind === 'environment') {
      const isParent = children.length > 0;
      const isChild = !!parentId;
      this.iconPath = isParent
        ? new vscode.ThemeIcon('server-process')
        : (isChild ? new vscode.ThemeIcon('arrow-subwards') : new vscode.ThemeIcon('server-environment'));
      this.contextValue = isParent ? 'byrdsnest.environment.parent' : 'byrdsnest.environment';
      if (customDescription === undefined) {
        this.description = isParent ? `Parent (${children.length})` : (isChild ? 'child' : 'Root');
      }
      this.tooltip = `Environment: ${label}`;
    } else if (kind === 'collection') {
      this.iconPath = new vscode.ThemeIcon('repo');
      const count = children.length;
      if (customDescription === undefined) {
        this.description = `${count} ${count === 1 ? 'item' : 'items'}`;
      }
      this.tooltip = `Collection: ${label}`;
    } else if (kind === 'folder') {
      this.iconPath = new vscode.ThemeIcon('folder');
      const count = children.length;
      if (customDescription === undefined) {
        this.description = `${count} ${count === 1 ? 'request' : 'requests'}`;
      }
    } else if (kind === 'request') {
      const method = (requestContext?.method || 'GET').toUpperCase();
      const color = METHOD_COLORS[method] || 'charts.foreground';
      this.iconPath = new vscode.ThemeIcon('arrow-right', new vscode.ThemeColor(color));
      if (customDescription === undefined) {
        this.description = method;
      }
      this.tooltip = `${method} ${requestContext?.url || label}`;
    } else if (kind === 'history') {
      const method = (requestContext?.method || 'GET').toUpperCase();
      const color = METHOD_COLORS[method] || 'charts.foreground';
      this.iconPath = new vscode.ThemeIcon('arrow-right', new vscode.ThemeColor(color));
      if (customDescription === undefined) {
        this.description = method;
      }
      this.tooltip = `${method} ${requestContext?.url || label}`;
      this.contextValue = 'byrdsnest.historyItem';
    } else if (kind === 'token') {
      this.iconPath = new vscode.ThemeIcon('key');
      this.contextValue = 'byrdsnest.token';
    } else if (kind === 'noTokens') {
      this.iconPath = new vscode.ThemeIcon('info');
      this.contextValue = 'byrdsnest.noTokens';
    }
  }
}

