/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unnecessary-boolean-literal-compare */
import { MessageEventBusDestination } from './MessageEventBusDestination';
import axios, { AxiosRequestConfig, AxiosResponse, Method } from 'axios';
import { eventBus } from '../MessageEventBus/MessageEventBus';
import { EventMessageTypes } from '../EventMessageClasses';
import {
	jsonParse,
	MessageEventBusDestinationOptions,
	MessageEventBusDestinationTypeNames,
	MessageEventBusDestinationWebhookOptions,
	MessageEventBusDestinationWebhookParameterItem,
	MessageEventBusDestinationWebhookParameterOptions,
} from 'n8n-workflow';
import { CredentialsHelper } from '../../CredentialsHelper';
import { UserSettings, requestOAuth1, requestOAuth2, requestWithAuthentication } from 'n8n-core';
import { Agent as HTTPSAgent } from 'https';
import config from '../../config';

export const isMessageEventBusDestinationWebhookOptions = (
	candidate: unknown,
): candidate is MessageEventBusDestinationWebhookOptions => {
	const o = candidate as MessageEventBusDestinationWebhookOptions;
	if (!o) return false;
	return o.url !== undefined;
};

export class MessageEventBusDestinationWebhook
	extends MessageEventBusDestination
	implements MessageEventBusDestinationWebhookOptions
{
	__type: string = MessageEventBusDestinationTypeNames.webhook;

	url: string;

	responseCodeMustMatch = false;

	expectedStatusCode = 200;

	method = 'POST';

	authentication: 'predefinedCredentialType' | 'genericCredentialType' | 'none' = 'none';

	sendQuery = false;

	sendHeaders = false;

	genericAuthType = '';

	nodeCredentialType = '';

	specifyHeaders = '';

	specifyQuery = '';

	jsonQuery = '';

	jsonHeaders = '';

	headerParameters: MessageEventBusDestinationWebhookParameterItem = { parameters: [] };

	queryParameters: MessageEventBusDestinationWebhookParameterItem = { parameters: [] };

	options: MessageEventBusDestinationWebhookParameterOptions = {};

	sendPayload = true;

	credentialsHelper?: CredentialsHelper;

	axiosRequestOptions: AxiosRequestConfig;

	constructor(options: MessageEventBusDestinationWebhookOptions) {
		super(options);
		this.url = options.url;
		this.label = options.label ?? 'Webhook Endpoint';
		if (options.__type) this.__type = options.__type;
		if (options.responseCodeMustMatch) this.responseCodeMustMatch = options.responseCodeMustMatch;
		if (options.expectedStatusCode) this.expectedStatusCode = options.expectedStatusCode;
		if (options.method) this.method = options.method;
		if (options.authentication) this.authentication = options.authentication;
		if (options.sendQuery) this.sendQuery = options.sendQuery;
		if (options.sendHeaders) this.sendHeaders = options.sendHeaders;
		if (options.genericAuthType) this.genericAuthType = options.genericAuthType;
		if (options.nodeCredentialType) this.nodeCredentialType = options.nodeCredentialType;
		if (options.specifyHeaders) this.specifyHeaders = options.specifyHeaders;
		if (options.specifyQuery) this.specifyQuery = options.specifyQuery;
		if (options.jsonQuery) this.jsonQuery = options.jsonQuery;
		if (options.jsonHeaders) this.jsonHeaders = options.jsonHeaders;
		if (options.headerParameters) this.headerParameters = options.headerParameters;
		if (options.queryParameters) this.queryParameters = options.queryParameters;
		if (options.sendPayload) this.sendPayload = options.sendPayload;
		if (options.options) this.options = options.options;
	}

	async matchDecryptedCredentialType(credentialType: string) {
		const foundCredential = Object.entries(this.credentials).find((e) => e[0] === credentialType);
		if (foundCredential) {
			const timezone = config.getEnv('generic.timezone');
			const credentialsDecrypted = await this.credentialsHelper?.getDecrypted(
				foundCredential[1],
				foundCredential[0],
				'internal',
				timezone,
				true,
			);
			return credentialsDecrypted;
		}
		return null;
	}

	async generateAxiosOptions() {
		if (this.axiosRequestOptions?.url) {
			return;
		}

		this.axiosRequestOptions = {
			headers: {},
			method: this.method as Method,
			url: this.url,
			maxRedirects: 0,
		} as AxiosRequestConfig;

		if (this.credentialsHelper === undefined) {
			let encryptionKey: string | undefined;
			try {
				encryptionKey = await UserSettings.getEncryptionKey();
			} catch (_) {}
			if (encryptionKey) {
				this.credentialsHelper = new CredentialsHelper(encryptionKey);
			}
		}

		let httpBasicAuth;
		let httpDigestAuth;
		let httpHeaderAuth;
		let httpQueryAuth;
		let oAuth1Api;
		let oAuth2Api;

		if (this.authentication === 'genericCredentialType') {
			if (this.genericAuthType === 'httpBasicAuth') {
				try {
					httpBasicAuth = await this.matchDecryptedCredentialType('httpBasicAuth');
				} catch (_) {}
			} else if (this.genericAuthType === 'httpDigestAuth') {
				try {
					httpDigestAuth = await this.matchDecryptedCredentialType('httpDigestAuth');
				} catch (_) {}
			} else if (this.genericAuthType === 'httpHeaderAuth') {
				try {
					httpHeaderAuth = await this.matchDecryptedCredentialType('httpHeaderAuth');
				} catch (_) {}
			} else if (this.genericAuthType === 'httpQueryAuth') {
				try {
					httpQueryAuth = await this.matchDecryptedCredentialType('httpQueryAuth');
				} catch (_) {}
			} else if (this.genericAuthType === 'oAuth1Api') {
				try {
					oAuth1Api = await this.matchDecryptedCredentialType('oAuth1Api');
				} catch (_) {}
			} else if (this.genericAuthType === 'oAuth2Api') {
				try {
					oAuth2Api = await this.matchDecryptedCredentialType('oAuth2Api');
				} catch (_) {}
			}
			// } else if (this.authentication === 'predefinedCredentialType') {
			// 	try {
			// 		nodeCredentialType = this.getNodeParameter('nodeCredentialType', 0) as string;
			// 	} catch (_) {}
		}

		const sendQuery = this.sendQuery;
		const specifyQuery = this.specifyQuery;
		const sendPayload = this.sendPayload;
		const sendHeaders = this.sendHeaders;
		const specifyHeaders = this.specifyHeaders;

		if (this.options.allowUnauthorizedCerts) {
			this.axiosRequestOptions.httpsAgent = new HTTPSAgent({ rejectUnauthorized: false });
		}

		if (this.options.redirect?.followRedirects) {
			this.axiosRequestOptions.maxRedirects = this.options.redirect?.maxRedirects;
		}

		// if (response?.response?.neverError === true) {
		// 	this.axiosRequestOptions.simple = false;
		// }

		if (this.options.proxy) {
			this.axiosRequestOptions.proxy = this.options.proxy;
		}

		if (this.options.timeout) {
			this.axiosRequestOptions.timeout = this.options.timeout;
		} else {
			this.axiosRequestOptions.timeout = 10000;
		}

		if (this.sendQuery && this.options.queryParameterArrays) {
			Object.assign(this.axiosRequestOptions, {
				qsStringifyOptions: { arrayFormat: this.options.queryParameterArrays },
			});
		}

		const parametersToKeyValue = async (
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			acc: Promise<{ [key: string]: any }>,
			cur: { name: string; value: string; parameterType?: string; inputDataFieldName?: string },
		) => {
			const acumulator = await acc;
			acumulator[cur.name] = cur.value;
			return acumulator;
		};

		// Get parameters defined in the UI
		if (sendQuery && this.queryParameters.parameters) {
			if (specifyQuery === 'keypair') {
				this.axiosRequestOptions.params = this.queryParameters.parameters.reduce(
					parametersToKeyValue,
					Promise.resolve({}),
				);
			} else if (specifyQuery === 'json') {
				// query is specified using JSON
				try {
					JSON.parse(this.jsonQuery);
				} catch (_) {
					console.log(`JSON parameter need to be an valid JSON`);
				}

				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				this.axiosRequestOptions.params = jsonParse(this.jsonQuery);
			}
		}

		// Get parameters defined in the UI
		if (sendHeaders && this.headerParameters.parameters) {
			if (specifyHeaders === 'keypair') {
				this.axiosRequestOptions.headers = this.headerParameters.parameters.reduce(
					parametersToKeyValue,
					Promise.resolve({}),
				);
			} else if (specifyHeaders === 'json') {
				// body is specified using JSON
				try {
					JSON.parse(this.jsonHeaders);
				} catch (_) {
					console.log(`JSON parameter need to be an valid JSON`);
				}

				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				this.axiosRequestOptions.headers = jsonParse(this.jsonHeaders);
			}
		}

		// default for bodyContentType.raw
		if (this.axiosRequestOptions.headers === undefined) {
			this.axiosRequestOptions.headers = {};
		}
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		this.axiosRequestOptions.headers['Content-Type'] = 'application/json';

		// Add credentials if any are set
		if (httpBasicAuth) {
			this.axiosRequestOptions.auth = {
				username: httpBasicAuth.user as string,
				password: httpBasicAuth.password as string,
			};
		} else if (httpHeaderAuth) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			this.axiosRequestOptions.headers[httpHeaderAuth.name as string] = httpHeaderAuth.value;
		} else if (httpQueryAuth) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			this.axiosRequestOptions.params[httpQueryAuth.name as string] = httpQueryAuth.value;
		} else if (httpDigestAuth) {
			this.axiosRequestOptions.auth = {
				username: httpDigestAuth.user as string,
				password: httpDigestAuth.password as string,
			};
		}
	}

	// async receiveFromEventBus(msg: EventMessageTypes): Promise<boolean> {
	// 	console.log('URL', this.url);
	// 	try {
	// 		if (this.responseCodeMustMatch) {
	// 			const postResult = await axios.post(this.url, msg);
	// 			if (postResult.status === this.expectedStatusCode) {
	// 				await eventBus.confirmSent(msg);
	// 			}
	// 		} else {
	// 			await axios.post(this.url, msg);
	// 			await eventBus.confirmSent(msg);
	// 		}
	// 		return true;
	// 	} catch (error) {
	// 		console.log(error.message);
	// 	}
	// 	return false;
	// }

	serialize(): MessageEventBusDestinationWebhookOptions {
		const abstractSerialized = super.serialize();
		return {
			...abstractSerialized,
			url: this.url,
			responseCodeMustMatch: this.responseCodeMustMatch,
			expectedStatusCode: this.expectedStatusCode,
			method: this.method,
			authentication: this.authentication,
			sendQuery: this.sendQuery,
			sendHeaders: this.sendHeaders,
			genericAuthType: this.genericAuthType,
			nodeCredentialType: this.nodeCredentialType,
			specifyHeaders: this.specifyHeaders,
			specifyQuery: this.specifyQuery,
			jsonQuery: this.jsonQuery,
			jsonHeaders: this.jsonHeaders,
			headerParameters: this.headerParameters,
			queryParameters: this.queryParameters,
			sendPayload: this.sendPayload,
			options: this.options,
			credentials: this.credentials,
		};
	}

	static deserialize(
		data: MessageEventBusDestinationOptions,
	): MessageEventBusDestinationWebhook | null {
		if (
			'__type' in data &&
			data.__type === MessageEventBusDestinationTypeNames.webhook &&
			isMessageEventBusDestinationWebhookOptions(data)
		) {
			return new MessageEventBusDestinationWebhook(data);
		}
		return null;
	}

	async receiveFromEventBus(msg: EventMessageTypes): Promise<boolean> {
		// at first run, build this.requestOptions with the destination settings
		await this.generateAxiosOptions();

		if (['PATCH', 'POST', 'PUT', 'GET'].includes(this.method.toUpperCase())) {
			if (this.sendPayload) {
				this.axiosRequestOptions.data = {
					...msg,
					ts: msg.ts.toISO(),
				};
			} else {
				this.axiosRequestOptions.data = {
					...msg,
					ts: msg.ts.toISO(),
					payload: undefined,
				};
			}
		}

		// TODO: implement extra auth requests

		// if (this.authentication === 'genericCredentialType' || this.authentication === 'none') {
		// if (oAuth1Api) {
		// const requestOAuth1Request = requestOAuth1.call(this, 'oAuth1Api', requestOptions);
		// requestOAuth1Request.catch(() => {});
		// requestPromise = requestOAuth1Request;
		// } else if (oAuth2Api) {
		// const requestOAuth2Request = requestOAuth2.call(this, 'oAuth2Api', requestOptions, {
		// 	tokenType: 'Bearer',
		// });
		// requestOAuth2Request.catch(() => {});
		// requestPromise = requestOAuth2Request;
		// } else {
		// bearerAuth, queryAuth, headerAuth, digestAuth, none
		// const request = this.helpers.request(requestOptions);
		// requestPromise = axios.request(requestOptions);
		// requestPromise.catch(() => {});
		// }
		// } else if (this.authentication === 'predefinedCredentialType' && this.nodeCredentialType) {
		// const additionalOAuth2Options = getOAuth2AdditionalParameters(nodeCredentialType);
		// // service-specific cred: OAuth1, OAuth2, plain
		// const requestWithAuthenticationRequest = requestWithAuthentication.call(
		// 	this,
		// 	nodeCredentialType,
		// 	requestOptions,
		// 	additionalOAuth2Options && { oauth2: additionalOAuth2Options },
		// );
		// requestWithAuthenticationRequest.catch(() => {});
		// requestPromise = requestWithAuthenticationRequest;
		// }
		// }

		const requestPromise: Promise<AxiosResponse> = axios.request(this.axiosRequestOptions);
		requestPromise.catch(() => {});
		const requestResponse = await requestPromise;

		if (this.responseCodeMustMatch) {
			if (requestResponse.status === this.expectedStatusCode) {
				await eventBus.confirmSent(msg);
				return true;
			} else {
				return false;
			}
		}

		await eventBus.confirmSent(msg);
		return true;
	}
}