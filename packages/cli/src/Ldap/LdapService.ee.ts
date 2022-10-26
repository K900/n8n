/* eslint-disable no-underscore-dangle */
import { Client, Entry, ClientOptions } from 'ldapts';
import { IDataObject, LoggerProxy as Logger } from 'n8n-workflow';
// eslint-disable-next-line import/no-cycle
import type { LdapConfig } from './types';

export class LdapService {
	private client: Client | undefined;

	private _config: LdapConfig;

	/**
	 * Set the LDAP configuration
	 * and expire the current client
	 * @param  {LdapConfig} config
	 */
	set config(config: LdapConfig) {
		this._config = config;
		this.client = undefined;
	}

	/**
	 * Get new/existing LDAP client,
	 * depending on whether the credentials
	 * were updated or not
	 */
	private async getClient() {
		if (this._config === undefined) {
			throw new Error('Service cannot be used without setting the property config');
		}
		if (this.client === undefined) {
			Logger.info(`LDAP - Creating new LDAP client`);
			const ldapOptions: ClientOptions = { url: this._config.connection.url };
			const tlsOptions: IDataObject = {};
			if (this._config.connection.useSsl) {
				tlsOptions.rejectUnauthorized = !this._config.connection.allowUnauthorizedCerts;
				if (this._config.connection.caCertificate) {
					tlsOptions.ca = [this._config.connection.caCertificate];
				}
				if (!this._config.connection.startTLS) {
					ldapOptions.tlsOptions = tlsOptions;
				}
			}

			this.client = new Client(ldapOptions);
			if (this._config.connection.startTLS) {
				await this.client.startTLS(tlsOptions);
			}
		}
	}

	/**
	 * Attempt a binding with the admin
	 * credentials
	 * @returns Promise
	 */
	private async bindAdmin(): Promise<void> {
		Logger.info(`LDAP - Binding with admin credentials`);
		await this.getClient();
		if (this.client) {
			await this.client.bind(this._config.binding.adminDn, this._config.binding.adminPassword);
		}
	}

	/**
	 * Search the LDAP server using
	 * the administrator binding (if any,
	 * else a anonymous bilding will be attempted)
	 * @param  {string} filter
	 * @returns Promise
	 */
	async searchWithAdminBinding(filter: string): Promise<Entry[]> {
		Logger.info(`LDAP - Searching with admin credentials`);
		await this.bindAdmin();
		if (this.client) {
			const { searchEntries } = await this.client.search(this._config.binding.baseDn, {
				filter,
			});
			await this.client.unbind();
			return searchEntries;
		}
		return Promise.resolve([]);
	}

	/**
	 * Attempt binding with the user's
	 * credentials
	 * @param  {string} dn
	 * @param  {string} password
	 * @returns Promise
	 */
	async validUser(dn: string, password: string): Promise<void> {
		Logger.info(`LDAP - Binding with user credentials`);
		await this.getClient();
		if (this.client) {
			await this.client.bind(dn, password);
			await this.client.unbind();
		}
	}

	/**
	 * Attempt binding with the adminatror
	 * credentials, to test the connection
	 * @returns Promise
	 */
	async testConnection(): Promise<void> {
		await this.bindAdmin();
	}
}
