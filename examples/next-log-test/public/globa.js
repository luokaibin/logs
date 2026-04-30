(function() {
  
    const addLogContext = () => {
      const logContext = {ownerId: null, twitterHandle: null, email: null, channel: null};
  
      window.LOGS_CONTEXT = new Proxy(logContext, {
        get(target, key) {
          if (key === 'twitterHandle') {
            return "colin.luo";
          }
          if (key === 'ownerId') {
            return "2024072706430841246513";
          }
          if (key === 'email') {
            return "colin.luo@evgtecc.com";
          }
          if (key === 'channel') {
            return "GOOGLE";
          }
          return target[key];
        },
      });
    }
  
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      addLogContext();
    }
  })();
  
  