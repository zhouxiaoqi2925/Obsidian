import { Plugin } from "obsidian";
import * as https from "https";
import * as http from "http";
import RequestHandler from "./requestHandler";
import { LocalRestApiSettings } from "./types";
import LocalRestApiPublicApi from "./api";
import { PluginManifest } from "obsidian";
export default class LocalRestApi extends Plugin {
  settings: LocalRestApiSettings;
  secureServer: https.Server | null;
  insecureServer: http.Server | null;
  requestHandler: RequestHandler;
  refreshServerState: () => void;
  registeredPublicApiConsumers: PluginManifest[];
  onload(): Promise<void>;
  getPublicApi(pluginManifest: PluginManifest): LocalRestApiPublicApi;
  debounce<F extends (...args: any[]) => any>(
    func: F,
    delay: number
  ): (...args: Parameters<F>) => void;
  _refreshServerState(): void;
  onunload(): void;
  loadSettings(): Promise<void>;
  saveSettings(): Promise<void>;
}
//# sourceMappingURL=main.d.ts.map
