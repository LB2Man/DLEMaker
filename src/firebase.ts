import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBVI6-GakRM9adNIs3DBX3ujwFexJb081U",
  authDomain: "dlemaker.firebaseapp.com",
  projectId: "dlemaker",
  storageBucket: "dlemaker.firebasestorage.app",
  messagingSenderId: "483731170687",
  appId: "1:483731170687:web:38abaa721fbd104c5a664a",
};

const firebaseApp = initializeApp(firebaseConfig);

export const auth = getAuth(firebaseApp);
