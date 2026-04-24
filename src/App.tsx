import {Route, Routes} from "react-router-dom";
import {Layout} from "./components/Layout";
import {Home} from "./routes/Home";
import {WellBaby} from "./routes/WellBaby";
import {Postpartum} from "./routes/Postpartum";
import {Inhaler} from "./routes/Inhaler";
import {PreVisit} from "./routes/PreVisit";
import {MedDuties} from "./routes/MedDuties";
import {PostVisit} from "./routes/PostVisit";
import {Settings} from "./routes/Settings";

export function App() {
    return (
        <Routes>
            <Route element={<Layout/>}>
                <Route index element={<Home/>}/>
                <Route path="/well-baby" element={<WellBaby/>}/>
                <Route path="/postpartum" element={<Postpartum/>}/>
                <Route path="/inhaler" element={<Inhaler/>}/>
                <Route path="/previsit" element={<PreVisit/>}/>
                <Route path="/medduties" element={<MedDuties/>}/>
                <Route path="/postvisit" element={<PostVisit/>}/>
                <Route path="/settings" element={<Settings/>}/>
            </Route>
        </Routes>
    );
}
