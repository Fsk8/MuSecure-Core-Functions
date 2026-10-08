// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MuSecureLicensing} from "../../src/MuSecureLicensing.sol";

/// @dev Receptor que rechaza fondos hasta que se le indique lo contrario; luego puede retirar.
///      Con `reenterWithdraw` intenta re-entrar a withdraw() mientras recibe el retiro.
contract Rejecter {
    bool public accept;
    bool public reenterWithdraw;
    bool public reenterBlocked;
    MuSecureLicensing public licensing;

    constructor(MuSecureLicensing l) {
        licensing = l;
    }

    function setAccept(bool v, bool tryReenter) external {
        accept = v;
        reenterWithdraw = tryReenter;
    }

    function claim() external {
        licensing.withdraw();
    }

    receive() external payable {
        require(accept, "rejecting");
        if (reenterWithdraw) {
            try licensing.withdraw() {} catch {
                reenterBlocked = true;
            }
        }
    }
}

/// @dev Receptor que consume todo el gas que reciba.
contract GasBurner {
    receive() external payable {
        while (true) {}
    }
}

/// @dev Al recibir su pago intenta comprar otra licencia (re-entrada en buyLicense).
contract Reenterer {
    MuSecureLicensing public licensing;
    bytes32 public hash;
    uint256 public price;
    bool public attempted;
    bool public succeeded;

    constructor(MuSecureLicensing l) payable {
        licensing = l;
    }

    function arm(bytes32 h, uint256 p) external {
        hash = h;
        price = p;
    }

    receive() external payable {
        if (attempted || price == 0) return;
        attempted = true;
        try licensing.buyLicense{value: price}(hash) {
            succeeded = true;
        } catch {}
    }
}
