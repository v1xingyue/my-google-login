import { useState } from "react";
import GoogleLogin, {
  GoogleLoginResponseOffline,
  GoogleLoginResponse,
  GoogleLogout,
} from "react-google-login";

export const ClientId =
  "25133019974-89dibcoen4c2m8e3jg6u6ch3pfp4d3t6.apps.googleusercontent.com";

export const Login = () => {
  const [user, setUser] = useState<unknown>(null);

  const onSuccess = (res: GoogleLoginResponse | GoogleLoginResponseOffline) => {
    if ("profileObj" in res) {
      console.log(res.profileObj);
      setUser(res.profileObj);
    }
    if ("tokenId" in res) {
      console.log(res.tokenId);
    }
  };

  const onFailure = (response: unknown) => {
    console.log(response);
  };

  return (
    <>
      <p>{JSON.stringify(user)}</p>

      <GoogleLogin
        clientId={ClientId}
        buttonText="Login With Google"
        onSuccess={onSuccess}
        onFailure={onFailure}
        cookiePolicy="single_host_origin"
        isSignedIn={true}
      />
    </>
  );
};

export const Logout = () => {
  const onSuccess = () => {
    console.log("Logout made successfully");
    location.href = "/";
  };

  return (
    <>
      <GoogleLogout clientId={ClientId} onLogoutSuccess={onSuccess} />
    </>
  );
};
