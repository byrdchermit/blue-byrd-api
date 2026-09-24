import * as vscode from 'vscode';
import { RequestContext, RequestItem, SidebarNodeKind } from '../../types';

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
    this.contextValue = `bluebyrd.${kind}`;

    if (customDescription !== undefined) {
      this.description = customDescription;
    }

    if (kind === 'active-filter') {
      this.iconPath = new vscode.ThemeIcon('filter');
      this.contextValue = 'bluebyrd.activeFilter';
      if (customDescription === undefined) {
        this.description = '(click to switch)';
      }
      this.tooltip = `Active Profile Scope: ${label}\nClick to switch profile scope.`;
    } else if (kind === 'section') {
      this.collapsibleState = defaultCollapsibleState ?? vscode.TreeItemCollapsibleState.Expanded;
      if (label === 'Profiles') {
        this.iconPath = new vscode.ThemeIcon('account');
        this.contextValue = 'bluebyrd.section.profiles';
      } else if (label === 'Environments') {
        this.iconPath = new vscode.ThemeIcon('server-environment');
        this.contextValue = 'bluebyrd.section.environments';
      } else if (label === 'Collections') {
        this.iconPath = new vscode.ThemeIcon('library');
        this.contextValue = 'bluebyrd.section.collections';
      } else if (label === 'History') {
        this.iconPath = new vscode.ThemeIcon('history');
        this.contextValue = 'bluebyrd.section.history';
      }
    } else if (kind === 'profile') {
      this.iconPath = itemId === 'global' ? new vscode.ThemeIcon('globe') : new vscode.ThemeIcon('person');
      this.contextValue = itemId === 'global' ? 'bluebyrd.profile.global' : 'bluebyrd.profile';
      if (customDescription === undefined) {
        this.description = 'profile';
      }
      this.tooltip = `Profile: ${label}`;
    } else if (kind === 'environment') {
      const isParent = children.length > 0;
      this.iconPath = isParent ? new vscode.ThemeIcon('server-process') : new vscode.ThemeIcon('globe');
      this.contextValue = isParent ? 'bluebyrd.environment.parent' : 'bluebyrd.environment';
      if (customDescription === undefined) {
        this.description = isParent ? `Parent (${children.length})` : 'env';
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
      this.tooltip = `Folder: ${label}`;
    } else if (kind === 'request') {
      const method = requestContext?.method || 'GET';
      this.iconPath = new vscode.ThemeIcon('symbol-method');
      if (customDescription === undefined) {
        this.description = method;
      }
      this.tooltip = `${method} ${requestContext?.url || label}`;
    } else if (kind === 'history') {
      const method = requestContext?.method || 'GET';
      this.iconPath = new vscode.ThemeIcon('clock');
      if (customDescription === undefined) {
        this.description = method;
      }
      this.tooltip = `${method} ${requestContext?.url || label}`;
      this.contextValue = 'bluebyrd.historyItem';
    }
  }
}

