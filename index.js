var gh = (function() {
  'use strict';

  var signin_button;
  var revoke_button;
  var user_info_div;

  var tokenFetcher = (function() {
    // Replace clientId and clientSecret with values obtained by you for your
    // application https://github.com/settings/applications.
    var clientId = '[*** see settings at auth0.com ***]';
    // Note that in a real-production app, you may not want to store
    // clientSecret in your App code.
    var clientSecret = '[*** see settings at auth0.com ***]';
    //FIXME:??
    var redirectUri = chrome.identity.getRedirectURL('provider_cb');
    var redirectRe = new RegExp(redirectUri + '[#\?](.*)');

    var access_token = null;

    return {
      getToken: function(interactive, callback) {
        // In case we already have an access_token cached, simply return it.
        if (access_token) {
          callback(null, access_token);
          return;
        }

        console.log(redirectUri);
        var options = {
          'interactive': interactive,
          'url': 'https://portchaw.auth0.com/login' +
                 '?client=' + clientId +
                 '&protocal=oauth2&response_type=code' +
                 '&redirect_uri=' + encodeURIComponent(redirectUri)
        }
        chrome.identity.launchWebAuthFlow(options, function(redirectUri) {
          console.log('launchWebAuthFlow completed', chrome.runtime.lastError,
              redirectUri);

          if (chrome.runtime.lastError) {
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
            handleProviderResponse(parseRedirectFragment(matches[1]));
          else
            callback(new Error('Invalid redirect URI'));
        });

        function parseRedirectFragment(fragment) {
          var pairs = fragment.split(/&/);
          var values = {};

          pairs.forEach(function(pair) {
            var nameval = pair.split(/=/);
            values[nameval[0]] = nameval[1];
          });

          return values;
        }

        function handleProviderResponse(values) {
          console.log("handleProviderResponse");
          console.log('providerResponse', values);
          if (values.hasOwnProperty('access_token'))
            setAccessToken(values.access_token);
          // If response does not have an access_token, it might have the code,
          // which can be used in exchange for token.
          else if (values.hasOwnProperty('code'))
            exchangeCodeForToken(values.code, values.state);
          else
            callback(new Error('Neither access_token nor code avialable.'));
        }

        function exchangeCodeForToken(code, state) {

          var xhr = new XMLHttpRequest();
//          xhr.open("GET", "http://localhost/callback?code=" + code + "&state=" + state);
//          xhr.send();
          xhr.open('POST', 'https://portchaw.auth0.com/oauth/token', true);

          var data = "client_id=" + clientId
                   + "&client_secret=" + clientSecret
                   + "&redirect_uri=" + redirectUri
                   + "&code=" + code
                   + "&grant_type=authorization_code";

          console.log(data, "data");

          xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
          xhr.setRequestHeader('Accept', 'application/json');
          xhr.onload = function () {
            // When exchanging code for token, the response comes as json, which
            // can be easily parsed to an object.
            console.log(xhr);
            if (this.status === 200) {
              var response = JSON.parse(this.responseText);
              console.log(data);
              console.log(response);
              if (response.hasOwnProperty('access_token')) {

                setAccessToken(response.access_token);
              } else {
                callback(new Error('Cannot obtain access_token from code.'));
              }
            } else {
              console.log('code exchange status:', this.status);
              callback(new Error('Code exchange failed'));
            }
          };
          xhr.send(data);
        }

        function setAccessToken(token) {
          access_token = token;
          console.log('Setting access_token: ', access_token);
          callback(null, access_token);
        }
      },

      removeCachedToken: function(token_to_remove) {
        if (access_token == token_to_remove)
          access_token = null;
      }
    };
  })();

  function xhrWithAuth(method, url, interactive, callback) {
    var retry = true;
    var access_token;

    console.log('xhrWithAuth', method, url, interactive);
    getToken();

    function getToken() {
      tokenFetcher.getToken(interactive, function(error, token) {
        console.log('token fetch', error, token);
        if (error) {
          callback(error);
          return;
        }

        access_token = token;
        requestStart();
      });
    }

    function requestStart() {
      var xhr = new XMLHttpRequest();
      xhr.open(method, url);
      xhr.setRequestHeader('Authorization', 'Bearer ' + access_token);
      xhr.onload = requestComplete;
      xhr.send();
    }

    function requestComplete() {
      console.log('requestComplete', this.status, this.response);
      if ( ( this.status < 200 || this.status >=300 ) && retry) {
        retry = false;
        tokenFetcher.removeCachedToken(access_token);
        access_token = null;
        getToken();
      } else {
        callback(null, this.status, this.response);
      }
    }
  }

  function getUserInfo(interactive) {
    xhrWithAuth('GET',
                'https://portchaw.auth0.com/userinfo',
                interactive,
                onUserInfoFetched);
  }

  // Functions updating the User Interface:

  function showButton(button) {
    button.style.display = 'inline';
    button.disabled = false;
  }

  function hideButton(button) {
    button.style.display = 'none';
  }

  function disableButton(button) {
    button.disabled = true;
  }

  function onUserInfoFetched(error, status, response) {
    if (!error && status == 200) {
      console.log("Got the following user info: " + response);
      var user_info = JSON.parse(response);
      // set token in local storage
      var access_token = user_info.identities[0].access_token;
      chrome.storage.sync.set({'access_token': access_token},
      function()
      {
        // Notify that we saved.
        console.log("set access_token in local storage to ", access_token);
      });
      populateUserInfo(user_info);
      hideButton(signin_button);
      showButton(revoke_button);
    } else {
      console.log('infoFetch failed', error, status);
      showButton(signin_button);
    }
  }

  function populateUserInfo(user_info) {
    console.log("user_info", user_info);
    var elem = user_info_div;
    var nameElem = document.createElement('div');
    nameElem.innerHTML = "<b>Hello " + user_info.name + "</b><br>"
    	+ "Your email is: " + user_info.email;
    elem.appendChild(nameElem);

    var elem = document.querySelector('#user_repos');
    elem.value= JSON.stringify(user_info);
  }

  // Handlers for the buttons's onclick events.

  function interactiveSignIn() {
    disableButton(signin_button);
    tokenFetcher.getToken(true, function(error, access_token) {
      if (error) {
        showButton(signin_button);
      } else {
        getUserInfo(true);
      }
    });
  }

  function revokeToken() {
    //FIXME:https://portchaw.auth0.com/logout?returnTo=
    // We are opening the web page that allows user to revoke their token.
    window.open('https://portchaw.auth0.com/logout');
    // And then clear the user interface, showing the Sign in button only.
    // If the user revokes the app authorization, they will be prompted to log
    // in again. If the user dismissed the page they were presented with,
    // Sign in button will simply sign them in.
    user_info_div.textContent = '';
    document.querySelector('#user_repos').value = "";
    hideButton(revoke_button);
    showButton(signin_button);
  }

  return {
    onload: function () {
      signin_button = document.querySelector('#signin');
      signin_button.onclick = interactiveSignIn;

      revoke_button = document.querySelector('#revoke');
      revoke_button.onclick = revokeToken;

      user_info_div = document.querySelector('#user_info');

      console.log(signin_button, revoke_button, user_info_div);

      showButton(signin_button);
      getUserInfo(false);
    }
  };
})();


window.onload = gh.onload;
