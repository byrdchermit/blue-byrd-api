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
    command?: vscode.Command
  ) {
    const isExpandable =
      kind === 'section' || kind === 'collection' || kind === 'folder';

    super(
      label,
      isExpandable
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );

    this.id = itemId ? `${kind}-${itemId}` : undefined;
    this.command = command;
    this.contextValue = `bluebyrd.${kind}`;

    if (kind === 'section') {
      this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
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
      this.iconPath = new vscode.ThemeIcon('person');
      this.description = 'profile';
      this.tooltip = `Profile: ${label}`;
    } else if (kind === 'environment') {
      this.iconPath = new vscode.ThemeIcon('globe');
      this.description = 'env';
      this.tooltip = `Environment: ${label}`;
    } else if (kind === 'collection') {
      this.iconPath = new vscode.ThemeIcon('repo');
      const count = children.length;
      this.description = `${count} ${count === 1 ? 'item' : 'items'}`;
      this.tooltip = `Collection: ${label}`;
    } else if (kind === 'folder') {
      this.iconPath = new vscode.ThemeIcon('folder');
      const count = children.length;
      this.description = `${count} ${count === 1 ? 'request' : 'requests'}`;
      this.tooltip = `Folder: ${label}`;
    } else if (kind === 'request') {
      const method = requestContext?.method || 'GET';
      this.iconPath = new vscode.ThemeIcon('symbol-method');
      this.description = method;
      this.tooltip = `${method} ${requestContext?.url || label}`;
    } else if (kind === 'history') {
      const method = requestContext?.method || 'GET';
      this.iconPath = new vscode.ThemeIcon('clock');
      this.description = method;
      this.tooltip = `${method} ${requestContext?.url || label}`;
      this.contextValue = 'bluebyrd.historyItem';
    }
  }
}

