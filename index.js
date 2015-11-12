var oposmAuth0 = (function()
{
  "use strict";

  var tokenFetcher = (function()
  {
    var clientId = "BUUIiuVhVkADDIoow6Xc8eqv2zheQHWL";

    // Client secret for Auth0 OPOSM app can be found here:
    // https://manage.auth0.com/#/applications/BUUIiuVhVkADDIoow6Xc8eqv2zheQHWL/settings
    var clientSecret = "[ * see Auth0.com * ]";

    var redirectUri = chrome.identity.getRedirectURL("provider_cb");
    var redirectRe = new RegExp(redirectUri + "[#\?](.*)");

    var access_token = null;

    function oposmRequest(toke)
    {
      var xhr = new XMLHttpRequest();
      var oposmAppServer = "dev.oposm.com";
      var companyId = "2c2QLNapBjq";
      var oposmUrl = "https://" + oposmAppServer + "/" + companyId + "/company";
      console.log("attempting to request " + oposmUrl + " using Jason Web Token (JWT)", toke);
      xhr.open("GET", oposmUrl);
      xhr.setRequestHeader("Authorization", "Bearer " + toke);
      xhr.onload = function()
      {
        if (this.status === 200)
        {
          var response = JSON.parse(this.responseText);
          console.log("response from " + oposmAppServer, response);
          document.querySelector("#output").value = this.responseText;
        }
        else
        {
          console.log("error in response from " + oposmAppServer);
        }
      };
      xhr.send();
    }
    return {
      getToken: function(interactive, callback)
      {
        // In case we already have an access_token cached, simply return it.
        if (access_token)
        {
          callback(null, access_token);
          return;
        }

        console.log(redirectUri);
        var options =
        {
          "interactive": interactive,
          "url": "https://portchaw.auth0.com/login" +
                 "?client=" + clientId +
                 "&protocal=oauth2&response_type=code" +
                 "&redirect_uri=" + encodeURIComponent(redirectUri)
        };
        chrome.identity.launchWebAuthFlow(options, function(redirectUri)
        {
          console.log("launchWebAuthFlow completed", chrome.runtime.lastError, redirectUri);

          if (chrome.runtime.lastError)
          {
            callback(new Error(chrome.runtime.lastError));
            return;
          }

          // Upon success the response is appended to redirectUri, e.g.
          // https://{app_id}.chromiumapp.org/provider_cb#access_token={value}
          //     &refresh_token={value}
          // or:
          // https://{app_id}.chromiumapp.org/provider_cb#code={value}
          var matches = redirectUri.match(redirectRe);
          if (matches && matches.length > 1)
          {
            handleProviderResponse(parseRedirectFragment(matches[1]));
          }
          else
          {
            callback(new Error("Invalid redirect URI"));
          }
        });

        function parseRedirectFragment(fragment)
        {
          var pairs = fragment.split(/&/);
          var values = {};

          pairs.forEach(function(pair)
          {
            var nameval = pair.split(/=/);
            values[nameval[0]] = nameval[1];
          });

          return values;
        }

        function handleProviderResponse(values)
        {
          console.log("handleProviderResponse");
          console.log("providerResponse", values);
          if (values.hasOwnProperty("access_token"))
          {
            setAccessToken(values.access_token);
          }
          // If response does not have an access_token, it might have the code,
          // which can be used in exchange for token.
          else if (values.hasOwnProperty("code"))
          {
            exchangeCodeForToken(values.code, values.state);
          }
          else
          {
            callback(new Error("Neither access_token nor code avialable."));
          }
        }

        function exchangeCodeForToken(code, state)
        {
          var xhr = new XMLHttpRequest();
          xhr.open("POST", "https://portchaw.auth0.com/oauth/token", true);

          var data = "client_id=" + clientId
                   + "&client_secret=" + clientSecret
                   + "&redirect_uri=" + redirectUri
                   + "&code=" + code
                   + "&grant_type=authorization_code";

          xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
          xhr.setRequestHeader("Accept", "application/json");
          xhr.onload = function ()
          {
            // When exchanging code for token, the response comes as json, which
            // can be easily parsed to an object.
            if (this.status === 200)
            {
              var response = JSON.parse(this.responseText);
              console.log("response, yo", response);
              console.log("calling oposmRequest with", response.id_token);
              oposmRequest(response.id_token);
            }
            else
            {
              console.log("code exchange status:", this.status);
              callback(new Error("Code exchange failed"));
            }
          };
          xhr.send(data);
        }
      }
    };
  })();

  // Handlers for the buttons"s onclick events.

  function interactiveSignIn()
  {
    tokenFetcher.getToken(true, function(error, access_token)
    {
      //something, something
    });
  }

  return {
    onload: function ()
    {
      document.querySelector("#signin").onclick = interactiveSignIn;
    }
  };
})();

window.onload = oposmAuth0.onload;
