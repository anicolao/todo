import { expect } from 'chai';
import fs from 'node:fs';
import { describe, it } from 'vitest';

import { selectListsForRefresh } from '$lib/list-refresh';

const backupPath =
	process.env.ANDREW_REPLAY_BACKUP || 'firestore-backups/prod-20260612T175700Z.json';
const maybeDescribe = fs.existsSync(backupPath) ? describe : describe.skip;
const andrewUid = 'mbQ1dSL9wRap9Uh6m4CK1LGBtZL2';
const obsoleteNames = new Set(['W List', 'X is nice', 'X List', 'Y List', 'Y list', 'Z List']);

interface ReplayState {
	visibleLists: string[];
	listIdToList: { [id: string]: string | undefined };
	listIdToTimestamp: { [id: string]: number | undefined };
	incomingRequests: string[];
	outgoingRequests: string[];
	completedRequests: string[];
	requestIdToRequest: { [id: string]: any };
	requestIdToUid: { [id: string]: string | undefined };
}

function decodeValue(value: any): any {
	if (!value) return null;
	if ('stringValue' in value) return value.stringValue;
	if ('integerValue' in value) return Number(value.integerValue);
	if ('doubleValue' in value) return Number(value.doubleValue);
	if ('booleanValue' in value) return value.booleanValue;
	if ('timestampValue' in value) {
		return { seconds: Math.floor(Date.parse(value.timestampValue) / 1000) };
	}
	if ('mapValue' in value) {
		return Object.fromEntries(
			Object.entries(value.mapValue.fields || {}).map(([key, nestedValue]) => [
				key,
				decodeValue(nestedValue)
			])
		);
	}
	if ('arrayValue' in value) {
		return (value.arrayValue.values || []).map(decodeValue);
	}
	return null;
}

function documentData(document: any) {
	return Object.fromEntries(
		Object.entries(document.fields || {}).map(([key, value]) => [key, decodeValue(value)])
	);
}

function timestamp(action: any) {
	return typeof action.timestamp === 'number'
		? action.timestamp
		: action.timestamp?.seconds || -Infinity;
}

function applyAction(state: ReplayState, action: any, isNormalAction: boolean) {
	switch (action.type) {
		case 'create_list':
			if (state.visibleLists.indexOf(action.payload.id) === -1) {
				state.visibleLists.push(action.payload.id);
			}
			state.listIdToList[action.payload.id] = action.payload.name;
			break;
		case 'rename_list':
			state.listIdToList[action.payload.id] = action.payload.name;
			break;
		case 'delete_list':
			state.visibleLists = state.visibleLists.filter((id: string) => id !== action.payload);
			delete state.listIdToList[action.payload];
			break;
		case 'revoke_share':
			state.visibleLists = state.visibleLists.filter((id: string) => id !== action.payload.id);
			delete state.listIdToList[action.payload.id];
			break;
		case 'accept_pending_share':
			if (state.visibleLists.indexOf(action.payload) === -1) {
				state.visibleLists = [action.payload, ...state.visibleLists];
			}
			break;
		case 'reorder_list': {
			const lists = [...state.visibleLists];
			const index = lists.indexOf(action.payload.id);
			if (index === -1) break;
			const [removed] = lists.splice(index, 1);
			const newIndex = action.payload.goes_before
				? lists.indexOf(action.payload.goes_before)
				: lists.length;
			if (newIndex !== -1) {
				state.visibleLists = [...lists.slice(0, newIndex), removed, ...lists.slice(newIndex)];
			}
			break;
		}
		case 'incoming_request':
			state.requestIdToRequest[action.payload.id] = action.payload.action;
			state.requestIdToUid[action.payload.id] = action.payload.uid;
			state.incomingRequests.push(action.payload.id);
			break;
		case 'accept_request':
		case 'reject_request':
			state.incomingRequests = state.incomingRequests.filter((id: string) => id !== action.payload.id);
			state.outgoingRequests = state.outgoingRequests.filter((id: string) => id !== action.payload.id);
			state.completedRequests.push(action.payload.id);
			break;
	}

	if (action.timestamp && isNormalAction) {
		const candidateId = action.payload?.list_id || action.payload?.id || action.payload;
		if (state.visibleLists.indexOf(candidateId) !== -1) {
			state.listIdToTimestamp[candidateId] = timestamp(action);
		}
	}
}

function newState(): ReplayState {
	return {
		visibleLists: [],
		listIdToList: {},
		listIdToTimestamp: {},
		incomingRequests: [],
		outgoingRequests: [],
		completedRequests: [],
		requestIdToRequest: {},
		requestIdToUid: {}
	};
}

maybeDescribe('Andrew backup replay', () => {
	it('startup selection replays enough list action logs to remove obsolete and undefined lists', () => {
		const documents = JSON.parse(fs.readFileSync(backupPath, 'utf8')).documents;
		const requestActions = documents
			.filter((document: any) => document.path.includes('/requests/'))
			.map((document: any) => ({
				...documentData(document),
				firebase_doc_id: document.path.split('/').at(-1)
			}))
			.filter((action: any) => action.target === andrewUid)
			.sort((a: any, b: any) => timestamp(a) - timestamp(b));
		const listActionsById = new Map<string, any[]>();
		const activityLists: { id: string; seconds: unknown }[] = [];

		documents.forEach((document: any) => {
			const parts = document.path.split('/');
			if (parts.length === 4 && parts[0] === 'lists' && parts[2] === 'actions') {
				const id = parts[1];
				if (!listActionsById.has(id)) listActionsById.set(id, []);
				listActionsById.get(id)?.push(documentData(document));
			}
			if (parts.length === 2 && parts[0] === 'activity') {
				activityLists.push({ id: parts[1], seconds: documentData(document).seconds });
			}
		});
		listActionsById.forEach((actions) => actions.sort((a, b) => timestamp(a) - timestamp(b)));

		const state = newState();
		requestActions.forEach((action: any) => {
			if (
				action.creator === andrewUid ||
				action.type === 'accept_request' ||
				action.type === 'reject_request'
			) {
				applyAction(state, action, false);
			} else {
				applyAction(
					state,
					{
						type: 'incoming_request',
						payload: { id: action.firebase_doc_id, uid: action.creator, action }
					},
					false
				);
			}
		});

		const listsToReplay = selectListsForRefresh({
			currentListId: null,
			visibleLists: state.visibleLists,
			listIdToTimestamp: state.listIdToTimestamp,
			activityLists,
			isStartup: true
		});

		listsToReplay.forEach((id) => {
			(listActionsById.get(id) || []).forEach((action) => applyAction(state, action, true));
		});

		const undefinedLists = state.visibleLists.filter((id: string) => state.listIdToList[id] === undefined);
		const obsoleteLists = state.visibleLists
			.map((id: string) => state.listIdToList[id])
			.filter((name: string | undefined) => name && obsoleteNames.has(name));

		expect(listsToReplay.length).to.equal(76);
		expect(state.visibleLists.length).to.equal(61);
		expect(undefinedLists).to.deep.equal([]);
		expect(obsoleteLists).to.deep.equal([]);
	});
});
