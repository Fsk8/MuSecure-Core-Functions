/**
 * MuSecure – services/LitEncryptionService.ts
 *
 * Encripta el archivo de audio con Lit Protocol.
 * Condición: solo el wallet que subió la obra puede desencriptar.
 * Red: Arbitrum One (chain id 42161).
 *
 * Instalar:
 *   npm install @lit-protocol/lit-node-client @lit-protocol/constants \
 *               @lit-protocol/auth-helpers @lit-protocol/types
 */

import * as LitJsSdk from "@lit-protocol/lit-node-client";
import { LitNetwork } from "@lit-protocol/constants";
import type { LitEncryptedRef } from "@/types/ipfs";

const LIT_NETWORK = LitNetwork.DatilDev; // usa DatilDev en dev, Datil en prod
const ARBITRUM_CHAIN = "arbitrum";
const ARBITRUM_CHAIN_ID = 42161;

/** Condición de acceso: solo la dirección `ownerAddress` puede desencriptar */
function buildAccessConditions(ownerAddress: string) {
  return [
    {
      conditionType: "evmBasic",
      contractAddress: "",
      standardContractType: "",
      chain: ARBITRUM_CHAIN,
      method: "",
      parameters: [":userAddress"],
      returnValueTest: {
        comparator: "=",
        value: ownerAddress.toLowerCase(),
      },
    },
  ];
}

export class LitEncryptionService {
  private static instance: LitEncryptionService | null = null;
  private client: LitJsSdk.LitNodeClient | null = null;
  private connected = false;

  private constructor() {}

  static getInstance(): LitEncryptionService {
    if (!LitEncryptionService.instance) {
      LitEncryptionService.instance = new LitEncryptionService();
    }
    return LitEncryptionService.instance;
  }

  private async getClient(): Promise<LitJsSdk.LitNodeClient> {
    if (this.client && this.connected) return this.client;

    this.client = new LitJsSdk.LitNodeClient({
      litNetwork: LIT_NETWORK,
      debug: false,
    });

    await this.client.connect();
    this.connected = true;
    return this.client;
  }

  /**
   * Encripta un archivo de audio.
   * @param file - El archivo original
   * @param ownerAddress - Wallet checksum del creador (único que puede desencriptar)
   * @returns Blob del ciphertext + hash para verificación + condiciones serializadas
   */
  async encryptAudio(
    file: File,
    ownerAddress: string
  ): Promise<{
    ciphertextBlob: Blob;
    dataToEncryptHash: string;
    accessConditions: string;
  }> {
    const client = await this.getClient();
    const accessConditions = buildAccessConditions(ownerAddress);

    const fileBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(fileBuffer);

    const { ciphertext, dataToEncryptHash } = await LitJsSdk.encryptUint8Array(
      { uint8Array: uint8, accessControlConditions: accessConditions },
      client
    );

    return {
      ciphertextBlob: new Blob([ciphertext], { type: "application/octet-stream" }),
      dataToEncryptHash,
      accessConditions: JSON.stringify(accessConditions),
    };
  }

  /**
   * Desencripta un archivo de audio (para reproducción del owner).
   * Requiere que el usuario firme con su wallet para obtener la sesión Lit.
   */
  async decryptAudio(
    ciphertextBlob: Blob,
    dataToEncryptHash: string,
    accessConditions: string,
    sessionSigs: Record<string, unknown>
  ): Promise<Uint8Array> {
    const client = await this.getClient();
    const parsed = JSON.parse(accessConditions);

    const ciphertextBuffer = await ciphertextBlob.arrayBuffer();
    const ciphertext = new Uint8Array(ciphertextBuffer);

    const decrypted = await LitJsSdk.decryptToUint8Array(
      {
        ciphertext,
        dataToEncryptHash,
        accessControlConditions: parsed,
        chain: ARBITRUM_CHAIN,
        sessionSigs,
      },
      client
    );

    return decrypted;
  }

  /**
   * Genera session signatures firmando con el wallet conectado.
   * Necesitas pasar el signer de ethers/wagmi.
   */
  async getSessionSigs(
    ownerAddress: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    signer: any
  ): Promise<Record<string, unknown>> {
    const client = await this.getClient();

    const sessionSigs = await client.getSessionSigs({
      chain: ARBITRUM_CHAIN,
      expiration: new Date(Date.now() + 1000 * 60 * 60).toISOString(), // 1h
      resourceAbilityRequests: [
        {
          resource: new LitJsSdk.LitAccessControlConditionResource("*"),
          ability: LitJsSdk.LitAbility.AccessControlConditionDecryption,
        },
      ],
      authNeededCallback: async ({ uri, expiration, resourceAbilityRequests }) => {
        const toSign = await LitJsSdk.createSiweMessage({
          uri: uri!,
          expiration: expiration!,
          resources: resourceAbilityRequests!,
          walletAddress: ownerAddress,
          nonce: await client.getLatestBlockhash(),
          litNodeClient: client,
          domain: window.location.hostname,
          chainId: ARBITRUM_CHAIN_ID,
        });

        const signature = await signer.signMessage(toSign);
        return LitJsSdk.generateAuthSig({ sig: signature, derivedVia: "web3.eth.personal.sign", signedMessage: toSign, address: ownerAddress });
      },
    });

    return sessionSigs as Record<string, unknown>;
  }

  buildEncryptedRef(
    ciphertextCid: string,
    dataToEncryptHash: string,
    accessConditions: string
  ): LitEncryptedRef {
    return {
      ciphertextCid,
      dataToEncryptHash,
      accessConditions,
      litNetwork: LIT_NETWORK,
    };
  }

  disconnect(): void {
    this.client?.disconnect();
    this.connected = false;
    this.client = null;
  }
}
