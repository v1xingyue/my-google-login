import { useEffect, useState } from "react";
import "./App.css";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { fromB64 } from "@mysten/bcs";
import {
  generateRandomness,
  generateNonce,
  jwtToAddress,
  getExtendedEphemeralPublicKey,
  genAddressSeed,
  getZkLoginSignature,
} from "@mysten/zklogin";
import {
  CoinBalance,
  SuiClient,
  SuiTransactionBlockResponse,
} from "@mysten/sui.js/client";
import { JwtPayload, jwtDecode } from "jwt-decode";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import { SerializedSignature } from "@mysten/sui.js/cryptography";

export type PartialZkLoginSignature = Omit<
  Parameters<typeof getZkLoginSignature>["0"]["inputs"],
  "addressSeed"
>;

export interface ExtendedJwtPayload extends JwtPayload {
  nonce?: string;
}

export const ClientId =
  "25133019974-89dibcoen4c2m8e3jg6u6ch3pfp4d3t6.apps.googleusercontent.com";
const SUI_DEVNET_FAUCET = "https://faucet.devnet.sui.io/gas";
const FULLNODE_URL = "https://fullnode.devnet.sui.io"; // replace with the RPC URL you want to use

const App = () => {
  const isLoginBack = location.hash != "";
  const params = new URLSearchParams(location.hash.substring(1));
  const idToken = params.get("id_token");
  const [ephemeralKeypair, setEphemeralKeypair] =
    useState<Ed25519Keypair | null>(null);
  const [randomness, setRandomness] = useState<string>("");
  const [nonce, setNonce] = useState<string>("");
  const [loginUrl, setLoginUrl] = useState<string>("");
  const [decodedToken, setDecodedToken] = useState<ExtendedJwtPayload>({});
  const [zkProof, setZkProof] = useState<PartialZkLoginSignature | null>(null);
  const [userSalt, setUserSalt] = useState("");
  const [zkLoginAddress, setZkLoginUserAddress] = useState("");
  const [balance, setBalance] = useState<CoinBalance | null>(null);
  const [transactionResult, setTransactionResult] =
    useState<SuiTransactionBlockResponse | null>(null);

  useEffect(() => {
    if (!ephemeralKeypair) {
      if (localStorage.getItem("ephemeralKeypair")) {
        const pair = Ed25519Keypair.fromSecretKey(
          fromB64(localStorage.getItem("ephemeralKeypair")!)
        );
        if (pair) {
          setEphemeralKeypair(pair);
          return;
        }
      }
      const generated = Ed25519Keypair.generate();
      localStorage.setItem("ephemeralKeypair", generated.export().privateKey);
      setEphemeralKeypair(Ed25519Keypair.generate());
    }

    if (userSalt == "") {
      const salt = localStorage.getItem("userSalt");
      if (salt != null) {
        setUserSalt(salt);
      } else {
        const salt = generateRandomness();
        localStorage.setItem("userSalt", salt);
        setUserSalt(salt);
      }
    }
  }, [ephemeralKeypair, userSalt]);

  useEffect(() => {
    if (!isLoginBack) {
      if (randomness == "") {
        const randomness = generateRandomness();
        setRandomness(randomness);
        localStorage.setItem("randomness", randomness);
      }
    } else {
      const last = localStorage.getItem("randomness");
      if (last != null) {
        setRandomness(last);
      }
    }
  }, [randomness, isLoginBack]);

  useEffect(() => {
    const initLoginUrl = async () => {
      const suiClient = new SuiClient({
        url: FULLNODE_URL,
      });
      if (!isLoginBack) {
        if (ephemeralKeypair != null && randomness != "") {
          const { epoch } = await suiClient.getLatestSuiSystemState();
          const maxEpoch = Number(epoch) + 10;
          localStorage.setItem("maxEpoch", maxEpoch.toString());
          const nonce = generateNonce(
            ephemeralKeypair.getPublicKey(),
            maxEpoch,
            randomness
          );
          setNonce(nonce);

          const REDIRECT_URI = location.origin + "/";

          const params = new URLSearchParams({
            // See below for how to configure client ID and redirect URL
            client_id: ClientId,
            redirect_uri: REDIRECT_URI,
            response_type: "id_token",
            scope: "openid",
            // See below for details about generation of the nonce
            nonce: nonce,
          });

          const loginURL = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
          console.log(loginURL);
          setLoginUrl(loginURL);
        }
      } else {
        // login callback
        console.log("login callback !!");
        if (ephemeralKeypair) {
          const maxEpoch = Number(localStorage.getItem("maxEpoch"));
          const randomness = localStorage.getItem("randomness");
          console.log(maxEpoch, randomness);
          const nonce = generateNonce(
            ephemeralKeypair.getPublicKey(),
            maxEpoch,
            randomness!
          );
          setNonce(nonce + " Used");

          const decoded = jwtDecode(idToken as string) as ExtendedJwtPayload;
          console.log("decoded token : ", decoded);
          setDecodedToken(decoded);

          if (userSalt == "") {
            const owner = jwtToAddress(idToken as string, userSalt);
            setZkLoginUserAddress(owner);

            const balance = await suiClient.getBalance({
              owner,
            });

            setBalance(balance);
          }
        }
      }
    };
    initLoginUrl();
  }, [
    ephemeralKeypair,
    loginUrl,
    randomness,
    isLoginBack,
    idToken,
    userSalt,
    zkLoginAddress,
  ]);

  const loadZkProof = async (event: React.MouseEvent<HTMLElement>) => {
    console.log("load ZkProof");

    if (ephemeralKeypair != null && randomness != "" && userSalt != "") {
      const maxEpoch = Number(localStorage.getItem("maxEpoch"));
      const extendedEphemeralPublicKey = getExtendedEphemeralPublicKey(
        ephemeralKeypair.getPublicKey()
      );
      console.log(extendedEphemeralPublicKey);

      const url = "https://prover-dev.mystenlabs.com/v1";
      const data = {
        jwt: idToken,
        extendedEphemeralPublicKey: extendedEphemeralPublicKey,
        maxEpoch: maxEpoch,
        jwtRandomness: randomness,
        salt: userSalt,
        keyClaimName: "sub",
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const zkProofResult = (await response.json()) as PartialZkLoginSignature;
      // console.log(zkProofResult);
      // alert(JSON.stringify(zkProofResult, null, 2));
      setZkProof(zkProofResult);
    }

    event.preventDefault();
  };

  const doTransaction = async () => {
    if (zkLoginAddress != "" && ephemeralKeypair != null && zkProof != null) {
      const maxEpoch = Number(localStorage.getItem("maxEpoch"));
      const txb = new TransactionBlock();

      txb.setSender(zkLoginAddress);
      const client = new SuiClient({
        url: FULLNODE_URL,
      });

      try {
        const { bytes, signature: userSignature } = await txb.sign({
          client,
          signer: ephemeralKeypair,
        });

        console.log("userSignature:", userSignature);

        console.log("jwt token decoded : ", decodedToken);

        // Generate addressSeed using userSalt, sub, and aud (JWT Payload)
        // as parameters for obtaining zkLoginSignature
        const addressSeed: string = genAddressSeed(
          BigInt(userSalt),
          "sub",
          decodedToken.sub as string,
          decodedToken.aud as string
        ).toString();

        console.log("addressSeed : ", addressSeed);

        const zkLoginSignature: SerializedSignature = getZkLoginSignature({
          inputs: {
            ...zkProof,
            addressSeed,
          },
          maxEpoch,
          userSignature,
        });

        console.log("zkLoginSignature : ", zkLoginSignature);

        const result = await client.executeTransactionBlock({
          transactionBlock: bytes,
          signature: zkLoginSignature,
        });
        console.log("exeucte : ", result);
        alert(result);
        setTransactionResult(result);
      } catch (error) {
        alert("error : " + error);
      }
    }
  };

  const getTestToken = async () => {
    if (zkLoginAddress != "") {
      const response = await fetch(SUI_DEVNET_FAUCET, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          FixedAmountRequest: {
            recipient: zkLoginAddress,
          },
        }),
      });
      const json = await response.json();
      return json;
    }
  };

  return (
    <div className="App">
      <div className="card">
        <h2>Prepare Login with Google!</h2>
        {ephemeralKeypair ? (
          <div>
            <p>
              <span className="bold">private: </span>
              {ephemeralKeypair.export().privateKey}
              <span className="bold">public: </span>
              {ephemeralKeypair.getPublicKey().toBase64()}{" "}
            </p>
          </div>
        ) : null}
        <p>randomness: {randomness}</p>
        <p>login nonce: {nonce}</p>
        <p>
          {isLoginBack ? (
            <a href={loginUrl}>Relogin</a>
          ) : (
            <a href={loginUrl}>Login With Google!</a>
          )}
        </p>
      </div>
      {isLoginBack ? (
        <div className="card">
          <h2>Google Login Back</h2>
          <pre>{JSON.stringify(decodedToken, null, 2)}</pre>
          <p>User Salt : {userSalt}</p>
          <p>ZkLogin Address : {zkLoginAddress}</p>
          <p>Balance : {JSON.stringify(balance)}</p>
          <p>
            <button onClick={getTestToken} className="inline-link">
              Get Test Token
            </button>
            <button onClick={loadZkProof} className="inline-link">
              Fetch ZkProof
            </button>
            <button onClick={doTransaction}>Test Transaction</button>
          </p>
          {transactionResult ? (
            <p>{JSON.stringify(transactionResult)}</p>
          ) : zkProof == null ? null : (
            <p>{JSON.stringify(zkProof)}</p>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default App;
